import type { Delta } from "@/types";
import { ConnectionEnded, UpstreamError } from "~/lib/errors";
import type { FindboligClient } from "~/lib/findbolig-client";
import { limitedFor } from "~/lib/limiter";
import type { ApiOffer } from "~/types/offers";

/**
 * Walking findbolig.nu's offer listing, the one source of both offers and appointments.
 *
 * ## The cursor
 * The listing is walked newest `updated` first. A cursor is `since`, an `updated` value this
 * server handed out before (findbolig.nu's own clock, never a browser's), plus `sinceIds`, every
 * offer already reported at exactly `since`. An offer at `since` is skipped only when its id is
 * in `sinceIds`, so offers sharing one timestamp are told apart by id, not by fetch order, which
 * findbolig.nu does not keep stable. The walk hands out the next cursor as `latestUpdated` (the
 * newest `updated` in the listing) and `latestUpdatedIds` (every offer at that value). A walk
 * with no cursor is a full fetch: it walks the whole listing and hands out a cursor the same way.
 *
 * ## The failure rule
 * Each changed offer that belongs in the view is enriched, with one of three outcomes:
 * - **ok**: the enricher built an item; it is reported in `items`.
 * - **gone**: findbolig.nu answered, but there is nothing to build: the enricher returned `gone`
 *   (no residence, no thread) or a required part was refused with an `UpstreamError`. The offer is
 *   reported in `removedIds` and the cursor advances.
 * - **failed**: anything else thrown, which is transient: findbolig.nu unavailable for a required
 *   part, or the LLM erroring. The offer is left out and the cursor is **withheld**
 *   (`latestUpdated: null`), so the client keeps what it has and asks for the same changes again.
 *
 * Enrichment runs under the Connection's limit on calls in flight (see `limitedFor`).
 * An ended Connection fails the whole walk, so the route can clear the Connection cookie.
 * Changed offers that don't belong in the view are reported in `removedIds` without enrichment.
 */

/** Page size for walking the listing. */
export const DELTA_PAGE_SIZE = 25;

/** Where a walk picks up from; see the cursor rule above. */
export type ListingCursor = { since: string; sinceIds: string[] };

/** What an enricher returns when findbolig.nu answered but there is nothing to build. */
export const gone = Symbol("gone");

/** Turns a changed offer into an item, or `gone`. Throwing counts as failed, unless it is an `UpstreamError`. */
export type Enrich<T> = (offer: ApiOffer) => Promise<T | typeof gone>;

export type ListingView<T> = {
  /** Whether a changed offer belongs in this view at all. */
  belongs(offer: ApiOffer): boolean;
  enrich: Enrich<T>;
};

type Outcome<T> = { kind: "ok"; item: T } | { kind: "gone" } | { kind: "failed" };

/** Walks the listing from `cursor` (or all of it), enriching what changed by the failure rule above. */
export async function walkOfferListing<T>(
  client: FindboligClient,
  cursor: ListingCursor | null,
  view: ListingView<T>,
): Promise<Delta<T>> {
  const { changed, latestUpdated, latestUpdatedIds } = await collectChanged(client, cursor);

  const belonging = changed.filter((offer) => view.belongs(offer));
  const removedIds = changed.filter((offer) => !view.belongs(offer)).map((offer) => offer.id);

  let ended: ConnectionEnded | null = null;
  const enrich = async (offer: ApiOffer): Promise<Outcome<T>> => {
    // Once the Connection has ended, the rest is not worth asking findbolig.nu for.
    if (ended) return { kind: "failed" };
    try {
      const item = await view.enrich(offer);
      return item === gone ? { kind: "gone" } : { kind: "ok", item };
    } catch (error) {
      if (error instanceof ConnectionEnded) {
        ended = error;
        return { kind: "failed" };
      }
      if (error instanceof UpstreamError) return { kind: "gone" };
      console.error(`Failed to enrich offer ${offer.id}:`, error);
      return { kind: "failed" };
    }
  };
  const outcomes = await Promise.all(belonging.map((offer) => limitedFor(client, () => enrich(offer))));
  if (ended) throw ended;

  const items: T[] = [];
  let failed = false;
  for (const [i, outcome] of outcomes.entries()) {
    if (outcome.kind === "ok") items.push(outcome.item);
    else if (outcome.kind === "gone") removedIds.push(belonging[i].id);
    else failed = true;
  }

  return failed
    ? { items, removedIds, latestUpdated: null, latestUpdatedIds: [] }
    : { items, removedIds, latestUpdated, latestUpdatedIds };
}

/**
 * Pages through the listing until it reaches offers older than the cursor, or its end. Pages by
 * `totalResults` rather than trusting one page, so a busy account (or one not checked in a while)
 * doesn't silently lose changes.
 */
async function collectChanged(client: FindboligClient, cursor: ListingCursor | null) {
  const sinceMs = cursor ? new Date(cursor.since).getTime() : -Infinity;
  const sinceIds = new Set(cursor?.sinceIds ?? []);
  const changed: ApiOffer[] = [];
  const seen = new Set<string>();
  let latestUpdated: string | null = null;
  const latestUpdatedIds: string[] = [];
  const done = () => ({ changed, latestUpdated, latestUpdatedIds });

  for (let page = 0; ; page++) {
    const { results, totalResults } = await client.searchOffers({
      page,
      pageSize: DELTA_PAGE_SIZE,
      orderBy: "updated",
      orderDirection: "desc",
    });
    if (page === 0) latestUpdated = results[0]?.updated ?? null;

    for (const offer of results) {
      const offerMs = new Date(offer.updated).getTime();
      // Sorted desc: once one is this old, everything after it is too.
      if (offerMs < sinceMs) return done();

      if (offer.updated === latestUpdated) latestUpdatedIds.push(offer.id);

      const alreadyReported = offerMs === sinceMs && sinceIds.has(offer.id);
      if (!alreadyReported && !seen.has(offer.id)) {
        seen.add(offer.id);
        changed.push(offer);
      }
    }

    if (results.length === 0 || (page + 1) * DELTA_PAGE_SIZE >= totalResults) return done();
  }
}
