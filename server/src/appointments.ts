import type { Appointment, AppointmentDelta, CachedAppointmentEntry } from "@/types";
import { nullUnlessConnectionEnded } from "~/lib/errors";
import type { FindboligClient } from "~/lib/findbolig-client";
import { mapAppointmentToDomain } from "~/lib/findbolig-domain";
import type { AppointmentExtractor } from "~/lib/llm/appointment-extractor";
import { gone, walkOfferListing, type ListingCursor, type ListingView } from "~/offer-listing";

function isDateInPast(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const today = new Date().toISOString().slice(0, 10);
  return dateStr < today;
}

/**
 * Upcoming appointments: Finished and Published offers. Each is built reusing what the client
 * already has (`cached`) where possible:
 *  - a past appointment it has is echoed back as-is, with no upstream calls;
 *  - a thread with the same message count reuses the cached details, skipping the LLM;
 *  - anything else is extracted from the thread, falling back to the offer's showing text.
 * An offer with no residence or no thread is gone.
 */
function appointmentsView(
  client: FindboligClient,
  extractor: AppointmentExtractor,
  cached: CachedAppointmentEntry[],
): ListingView<Appointment> {
  const cacheByOfferId = new Map(cached.map((entry) => [entry.offerId, entry]));
  const year = new Date().getFullYear().toString();

  return {
    belongs: (offer) => offer.state === "Finished" || offer.state === "Published",
    async enrich(offer) {
      if (!offer.residenceId) return gone;
      const cachedEntry = cacheByOfferId.get(offer.id);
      if (cachedEntry && isDateInPast(cachedEntry.date)) return cachedEntry.appointment;

      const [residence, thread, position] = await Promise.all([
        client.getResidence(offer.residenceId),
        client.getThreadForOffer(offer.id),
        client.getPositionOnOffer(offer.id).catch(nullUnlessConnectionEnded),
      ]);
      if (!thread) return gone;
      const messageCount = thread.messages.length;

      if (cachedEntry && messageCount === cachedEntry.messageCount) {
        const details = {
          date: cachedEntry.appointment.date ?? "",
          startTime: cachedEntry.appointment.start ?? "",
          endTime: cachedEntry.appointment.end ?? "",
          cancelled: cachedEntry.appointment.cancelled,
        };
        return mapAppointmentToDomain({ offer, residence, details, position, messageCount });
      }

      let details = await extractor.fromThread(thread, year);
      if (!details.date && offer.showingText) {
        const showingDetails = await extractor.fromShowingText(offer.showingText, year);
        if (showingDetails.date && (showingDetails.startTime || showingDetails.endTime)) {
          details = showingDetails;
        }
      }
      return mapAppointmentToDomain({ offer, residence, details, position, messageCount });
    },
  };
}

/** Every upcoming appointment, and the cursor for the next delta. `cached` is what the client already has. */
export async function getUpcomingAppointments(
  client: FindboligClient,
  extractor: AppointmentExtractor,
  cached: CachedAppointmentEntry[],
) {
  const { items, latestUpdated, latestUpdatedIds } = await walkOfferListing(
    client,
    null,
    appointmentsView(client, extractor, cached),
  );
  return { appointments: items, latestUpdated, latestUpdatedIds };
}

/** What changed among upcoming appointments since `cursor`, reusing `cached` like a full sync does. */
export function getAppointmentUpdates(
  client: FindboligClient,
  extractor: AppointmentExtractor,
  cursor: ListingCursor,
  cached: CachedAppointmentEntry[],
): Promise<AppointmentDelta> {
  return walkOfferListing(client, cursor, appointmentsView(client, extractor, cached));
}
