import type { Appointment, AppointmentDelta, CachedAppointmentEntry, SyncAppointmentsResponse, ThreadCursor } from "@/types";
import { nullUnlessConnectionEnded } from "~/lib/errors";
import type { FindboligClient } from "~/lib/findbolig-client";
import { mapAppointmentToDomain, mapThreadToDomain } from "~/lib/findbolig-domain";
import { acceptedDetails, danishDate, EMPTY_DETAILS, showingContext, type AppointmentExtractor } from "~/lib/llm/appointment-extractor";
import { gone, walkOfferListing, type ListingCursor, type ListingView, type Walked } from "~/offer-listing";

function isDateInPast(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const today = new Date().toISOString().slice(0, 10);
  return dateStr < today;
}

/** Whether the thread list's newest message is newer than the newest the client has (or it has none). */
function isNewer(lastMessageAt: string | null, newestMessageAt: string | null | undefined): boolean {
  if (!lastMessageAt) return false;
  return !newestMessageAt || new Date(lastMessageAt).getTime() > new Date(newestMessageAt).getTime();
}

/**
 * Upcoming appointments: Finished and Published offers, found by the listing walk and the thread
 * walk (a new message does not move an offer's `updated`). Each is built reusing what the client
 * already has (`cached`) where possible:
 *  - a past appointment it has is echoed back as-is, with no upstream calls, unless the thread list
 *    has a message newer than any the client has: then only the thread is fetched again, for its
 *    messages (no LLM call, and the viewing, residence and position are kept);
 *  - a thread with the same message count reuses the cached details, skipping the LLM;
 *  - anything else is extracted in one LLM call from the thread or, when no message is about a
 *    showing, the offer's showing text (no call when neither is). The answer goes through `acceptedDetails`: a date
 *    must be quoted from the input and, from the showing text, come with a time.
 * An offer with no residence or no thread is gone.
 */
function appointmentsView(
  client: FindboligClient,
  extractor: AppointmentExtractor,
  cached: CachedAppointmentEntry[],
): ListingView<Appointment> {
  const cacheByOfferId = new Map(cached.map((entry) => [entry.offerId, entry]));
  const today = danishDate(new Date());

  return {
    name: "appointments",
    walksThreads: true,
    belongs: (offer) => offer.state === "Finished" || offer.state === "Published",
    async enrich(offer, { findbolig, llm }, { lastMessageAt }) {
      const { residenceId } = offer;
      if (!residenceId) return gone;
      const cachedEntry = cacheByOfferId.get(offer.id);
      if (cachedEntry && isDateInPast(cachedEntry.date)) {
        if (!isNewer(lastMessageAt, cachedEntry.newestMessageAt)) return cachedEntry.appointment;
        // A message after the viewing (how to apply, say): read it, but keep the viewing as it was.
        const thread = await findbolig(() => client.getThreadForOffer(offer.id));
        if (!thread) return cachedEntry.appointment;
        return { ...cachedEntry.appointment, ...mapThreadToDomain(thread, offer) };
      }

      const [residence, thread, position] = await findbolig(() =>
        Promise.all([
          client.getResidence(residenceId),
          client.getThreadForOffer(offer.id),
          client.getPositionOnOffer(offer.id).catch(nullUnlessConnectionEnded),
        ]),
      );
      if (!thread) return gone;
      const messageCount = thread.messages.length;

      if (cachedEntry && messageCount === cachedEntry.messageCount) {
        const details = {
          date: cachedEntry.appointment.date ?? "",
          startTime: cachedEntry.appointment.start ?? "",
          endTime: cachedEntry.appointment.end ?? "",
          cancelled: cachedEntry.appointment.cancelled,
        };
        return mapAppointmentToDomain({ offer, residence, details, position, thread });
      }

      const context = showingContext(thread, offer.showingText);
      const details = context ? acceptedDetails(context, await llm(() => extractor.extract(context, today))) : EMPTY_DETAILS;
      return mapAppointmentToDomain({ offer, residence, details, position, thread });
    },
  };
}

/** Where an appointments delta picks up from: the listing cursor and the thread cursor. */
export type AppointmentCursors = { listing: ListingCursor; threads: ListingCursor };

/** A walk's thread cursor, as the client stores and sends it back. */
function threadCursorFields({ threadCursor }: Walked<Appointment>): ThreadCursor {
  return { latestMessageAt: threadCursor?.since ?? null, latestMessageThreadIds: threadCursor?.sinceIds ?? [] };
}

/** Every upcoming appointment, and both cursors for the next delta. `cached` is what the client already has. */
export async function getUpcomingAppointments(
  client: FindboligClient,
  extractor: AppointmentExtractor,
  cached: CachedAppointmentEntry[],
): Promise<SyncAppointmentsResponse> {
  const walked = await walkOfferListing(client, null, appointmentsView(client, extractor, cached));
  const { items, latestUpdated, latestUpdatedIds } = walked;
  return { appointments: items, latestUpdated, latestUpdatedIds, ...threadCursorFields(walked) };
}

/** What changed among upcoming appointments since `cursors`, reusing `cached` like a full sync does. */
export async function getAppointmentUpdates(
  client: FindboligClient,
  extractor: AppointmentExtractor,
  cursors: AppointmentCursors,
  cached: CachedAppointmentEntry[],
): Promise<AppointmentDelta> {
  const walked = await walkOfferListing(client, cursors.listing, appointmentsView(client, extractor, cached), cursors.threads);
  const { items, removedIds, latestUpdated, latestUpdatedIds } = walked;
  return { items, removedIds, latestUpdated, latestUpdatedIds, ...threadCursorFields(walked) };
}
