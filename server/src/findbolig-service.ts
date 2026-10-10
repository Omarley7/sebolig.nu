import "dotenv/config";

import type { Appointment, CachedAppointmentEntry } from "@/types";
import { ConnectionEnded } from "~/lib/errors";
import type { FindboligClient } from "~/lib/findbolig-client";
import { mapAppointmentToDomain, mapOfferToDomain, mapWaitingListToDomain } from "~/lib/findbolig-domain";
import type { ApiOffer } from "~/types/offers";
import type { ApiResidenceApplication } from "~/types/waiting-lists";
import { extractAppointmentDetailsFromShowingText, extractAppointmentDetailsWithLLM } from "./lib/llm/openai-extractor";

// How many offers to pull per page when walking the updated-desc listing for a delta check.
const DELTA_PAGE_SIZE = 25;

/**
 * Enrichment tolerates a missing extra (a position, one residence), but never an ended Connection:
 * that has to reach the route so the Connection cookie is cleared.
 */
function rethrowIfConnectionEnded(error: unknown): void {
  if (error instanceof ConnectionEnded) throw error;
}

const nullUnlessConnectionEnded = (error: unknown): null => {
  rethrowIfConnectionEnded(error);
  return null;
};

function isDateInPast(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const today = new Date().toISOString().slice(0, 10);
  return dateStr < today;
}

/**
 * Walks the updated-desc offer listing, collecting every offer touched after `since`.
 * Paginates using `totalResults` rather than trusting a single page, so accounts with
 * more changes than fit on one page (a busy user, or one who hasn't checked in a while)
 * don't silently lose updates. Shared by every resource derived from this listing
 * (offers, appointments) — see `getOfferUpdates` / `getAppointmentUpdates`.
 *
 * `since` must be an `updated` value this server previously returned (i.e. findbolig.nu's
 * own clock) — never a client-generated timestamp. Comparing against a browser's local
 * clock risks clock skew between the two systems silently hiding or duplicating changes.
 *
 * Equal-timestamp batches (several offers touched in the same instant, e.g. a bulk
 * upstream operation) can span more than one delta call once the batch is bigger than
 * `DELTA_PAGE_SIZE`, or straddle the boundary between "already reported" and "new" when
 * two separate offers happen to land on the exact same `updated` value. A plain `since`
 * timestamp alone can't tell those apart. `sinceIds` — every offer id this server already
 * reported at exactly `since` — resolves the tie: an offer at `since` is only skipped if
 * its id is in that set, so a same-timestamp offer that arrives *after* the previous call
 * (and is therefore not in `sinceIds`) is never dropped. We don't rely on the upstream
 * API's tie-break order being stable across requests — membership, not position, decides.
 * The complementary `latestUpdatedIds` in the return value is that same set for the
 * *next* call, scoped to whatever `updated` value is now the walk's newest.
 */
export async function getOffersUpdatedSince(
  client: FindboligClient,
  since: string,
  sinceIds: string[] = [],
): Promise<{ changed: ApiOffer[]; latestUpdated: string | null; latestUpdatedIds: string[] }> {
  const sinceMs = new Date(since).getTime();
  const sinceIdSet = new Set(sinceIds);
  const changed: ApiOffer[] = [];
  const seenOfferIds = new Set<string>();
  let latestUpdated: string | null = null;
  const latestUpdatedIds: string[] = [];
  let page = 0;

  while (true) {
    const { results, totalResults } = await client.searchOffers({
      page,
      pageSize: DELTA_PAGE_SIZE,
      orderBy: "updated",
      orderDirection: "desc",
    });

    if (page === 0) {
      latestUpdated = results[0]?.updated ?? null;
    }

    for (const offer of results) {
      const offerMs = new Date(offer.updated).getTime();
      if (offerMs < sinceMs) {
        // Sorted desc — once we hit one this old, everything after it is too.
        return { changed, latestUpdated, latestUpdatedIds };
      }

      if (offer.updated === latestUpdated) {
        latestUpdatedIds.push(offer.id);
      }

      const alreadyReported = offerMs === sinceMs && sinceIdSet.has(offer.id);
      if (!alreadyReported && !seenOfferIds.has(offer.id)) {
        seenOfferIds.add(offer.id);
        changed.push(offer);
      }
    }

    page += 1;
    if (results.length === 0 || page * DELTA_PAGE_SIZE >= totalResults) {
      return { changed, latestUpdated, latestUpdatedIds };
    }
  }
}

/**
 * Turns an offer into an Appointment, reusing a cached entry when possible:
 *  - Path 1: past appointment with cached data — echo back as-is (no upstream calls at all).
 *  - Path 2: thread unchanged since last time (same message count) — skip the LLM, reuse cached details.
 *  - Path 3: new or changed — full LLM extraction (falling back to showing-text extraction).
 * Returns null if the offer has no residence/thread to build an appointment from.
 */
async function enrichAppointment(
  client: FindboligClient,
  offer: ApiOffer,
  currentYear: string,
  cachedEntry?: CachedAppointmentEntry,
): Promise<Appointment | null> {
  if (!offer.residenceId || !offer.id) return null;

  if (cachedEntry && isDateInPast(cachedEntry.date)) {
    return cachedEntry.appointment;
  }

  const [residence, thread, position] = await Promise.all([
    client.getResidence(offer.residenceId),
    client.getThreadForOffer(offer.id),
    client.getPositionOnOffer(offer.id).catch(nullUnlessConnectionEnded),
  ]);

  if (!thread) return null;

  if (cachedEntry && thread.messages.length === cachedEntry.messageCount) {
    const details = {
      date: cachedEntry.appointment.date ?? "",
      startTime: cachedEntry.appointment.start ?? "",
      endTime: cachedEntry.appointment.end ?? "",
      cancelled: cachedEntry.appointment.cancelled,
    };
    return mapAppointmentToDomain({ offer, residence, details, position, messageCount: thread.messages.length });
  }

  let details = await extractAppointmentDetailsWithLLM(thread, currentYear);
  if (!details.date && offer.showingText) {
    const showingDetails = await extractAppointmentDetailsFromShowingText(offer.showingText, currentYear);
    if (showingDetails.date && (showingDetails.startTime || showingDetails.endTime)) {
      details = showingDetails;
    }
  }

  return mapAppointmentToDomain({ offer, residence, details, position, messageCount: thread.messages.length });
}

const isUpcomingAppointmentState = (offer: ApiOffer) => offer.state === "Finished" || offer.state === "Published";

/**
 * Fetches upcoming appointments with optional incremental sync, alongside the current
 * `updated` high-water mark (see `getActiveOffers` / `getAppointmentUpdates` for why this
 * cursor matters).
 * When `cached` is provided, the server skips expensive work for past and unchanged appointments.
 * @param includeAll - If true, fetches all offers; if false, only fetches active offers (Finished/Published)
 * @param cached - Optional cached appointment entries from the client for incremental sync
 */
export async function getUpcomingAppointments(client: FindboligClient, includeAll: boolean = false, cached?: CachedAppointmentEntry[]) {
  try {
    const offersPage = await client.searchOffers({ orderBy: "updated", orderDirection: "desc" });
    const latestUpdated = offersPage.results[0]?.updated ?? null;

    const offers = includeAll ? offersPage.results : offersPage.results.filter(isUpcomingAppointmentState);
    const cacheMap = new Map((cached ?? []).map((entry) => [entry.offerId, entry]));
    const currentYear = new Date().getFullYear().toString();

    const results = await Promise.all(
      offers.map((offer) => enrichAppointment(client, offer, currentYear, cacheMap.get(offer.id))),
    );

    return {
      appointments: results.filter((a): a is NonNullable<typeof a> => a !== null),
      latestUpdated,
    };
  } catch (error) {
    console.error("Failed to fetch upcoming appointments:", error);
    throw error;
  }
}

/**
 * Lightweight delta check for appointments: finds offers touched since `since` and only pays
 * the residence/thread/LLM cost for those, instead of re-deriving every appointment on every
 * navigation. `includeAll` mirrors `getUpcomingAppointments`'s own toggle — when true nothing
 * is ever "removed" from the view, since every offer state is already included.
 */
export async function getAppointmentUpdates(
  client: FindboligClient,
  since: string,
  includeAll: boolean = false,
  sinceIds: string[] = [],
) {
  const { changed, latestUpdated, latestUpdatedIds } = await getOffersUpdatedSince(client, since, sinceIds);

  const relevant = includeAll ? changed : changed.filter(isUpcomingAppointmentState);
  const removedIds = includeAll ? [] : changed.filter((offer) => !isUpcomingAppointmentState(offer)).map((offer) => offer.id);

  const currentYear = new Date().getFullYear().toString();
  const enriched = await Promise.all(
    relevant.map(async (offer) => ({ offerId: offer.id, appointment: await enrichAppointment(client, offer, currentYear) })),
  );
  const missingIds = enriched.filter(({ appointment }) => !appointment).map(({ offerId }) => offerId);
  return {
    items: enriched.flatMap(({ appointment }) => appointment ? [appointment] : []),
    removedIds: [...removedIds, ...missingIds],
    latestUpdated,
    latestUpdatedIds,
  };
}

/** Fetches residence + waiting-list position for an offer and maps it to the domain `Offer` shape, or null if either lookup fails. */
async function enrichOffer(client: FindboligClient, offer: ApiOffer) {
  if (!offer.residenceId || !offer.id) return null;
  try {
    const [residence, position] = await Promise.all([
      client.getResidence(offer.residenceId),
      client.getPositionOnOffer(offer.id).catch(nullUnlessConnectionEnded),
    ]);
    return mapOfferToDomain({ offer, residence, position });
  } catch (error) {
    rethrowIfConnectionEnded(error);
    console.error(`Failed to load residence for offer ${offer.id}:`, error);
    return null;
  }
}

/** Fetches active (Published) offers with residence data eagerly loaded, alongside the current `updated` high-water mark. */
export async function getActiveOffers(client: FindboligClient) {
  // Sorted by updated desc so results[0].updated is cheaply the latest touch on any of this
  // user's offers — the same cursor semantics `getOfferUpdates` below compares against.
  const offersPage = await client.searchOffers({ orderBy: "updated", orderDirection: "desc" });
  const latestUpdated = offersPage.results[0]?.updated ?? null;

  const publishedOffers = offersPage.results.filter((offer) => offer.state === "Published");
  const enriched = await Promise.all(publishedOffers.map((offer) => enrichOffer(client, offer)));

  return {
    offers: enriched.filter((o): o is NonNullable<typeof o> => o !== null),
    latestUpdated,
  };
}

/**
 * Lightweight delta check for the offers list: finds what changed since `since` and only
 * pays the residence/position enrichment cost (2 upstream calls per offer) for those offers,
 * instead of re-enriching every active offer on every navigation.
 */
export async function getOfferUpdates(client: FindboligClient, since: string, sinceIds: string[] = []) {
  const { changed, latestUpdated, latestUpdatedIds } = await getOffersUpdatedSince(client, since, sinceIds);

  const stillPublished = changed.filter((offer) => offer.state === "Published");
  const removedIds = changed.filter((offer) => offer.state !== "Published").map((offer) => offer.id);

  const enriched = await Promise.all(stillPublished.map((offer) => enrichOffer(client, offer)));
  const successful = enriched.every((offer) => offer !== null);

  return {
    items: enriched.filter((o): o is NonNullable<typeof o> => o !== null),
    removedIds,
    latestUpdated: successful ? latestUpdated : null,
    latestUpdatedIds: successful ? latestUpdatedIds : [],
  };
}

/** Minimal concurrency limiter — runs at most `limit` tasks in parallel, preserving input order. */
async function pLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Aggregates per-residence application rows into per-property WaitingList objects,
 * enriching with property metadata (from /api/search) and best-position info.
 */
export async function getWaitingLists(client: FindboligClient) {
  const applications = await client.getResidenceApplications();

  // Group by propertyId
  const byProperty = new Map<string, ApiResidenceApplication[]>();
  for (const app of applications) {
    const list = byProperty.get(app.propertyId);
    if (list) list.push(app);
    else byProperty.set(app.propertyId, [app]);
  }

  const propertyIds = Array.from(byProperty.keys());
  if (propertyIds.length === 0) return [];

  // One batched search for all properties
  const properties = await client.searchPropertiesByIds(propertyIds);
  const propertyById = new Map(properties.map((p) => [p.id, p]));

  // Per-property position fetches with concurrency cap 5
  const positions = await pLimit(propertyIds, 5, async (propertyId) => {
    try {
      return await client.getPositionForProperty(propertyId);
    } catch (err) {
      rethrowIfConnectionEnded(err);
      console.warn(`Position fetch failed for ${propertyId}:`, err);
      return null;
    }
  });

  // Map and merge
  const lists = propertyIds.map((propertyId, i) => {
    const property = propertyById.get(propertyId);
    if (!property) {
      console.warn(`No property metadata found for ${propertyId} — skipping`);
      return null;
    }
    const apps = byProperty.get(propertyId)!;
    return mapWaitingListToDomain({
      applications: apps,
      property,
      position: positions[i],
    });
  });

  return lists.filter((l): l is NonNullable<typeof l> => l !== null);
}
