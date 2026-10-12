import type { Delta } from "@/types";
import { ConnectionEnded, UpstreamError } from "~/lib/errors";
import type { FindboligClient } from "~/lib/findbolig-client";
import { limitedFor } from "~/lib/limiter";
import type { ApiOffer, ApiOffersPage } from "~/types/offers";

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
 * with no cursor is a full sync: it walks the whole listing and hands out a cursor the same way.
 *
 * ## Paging
 * Both page by `totalResults`, so no change is silently lost. A delta fetches one page at a time
 * and stops at the cursor. A full sync fetches page 0 for `totalResults`, then every other page
 * at once. Listing pages are findbolig.nu calls, so they run under the Connection's limit too,
 * and a failing page fails the walk.
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
 * An enricher makes its findbolig.nu calls through `findbolig`, which runs them under the
 * Connection's limit on calls in flight (see `limitedFor`). Anything else it waits on, like the
 * LLM, runs outside that limit (through `llm`, to be counted), so it holds no slot another offer
 * could be fetching with. An ended Connection fails the whole walk, so the route can clear the
 * Connection cookie. Changed offers that don't belong in the view are reported in `removedIds`
 * without enrichment.
 *
 * ## The summary line
 * Each walk logs one line: offers walked (changed since the cursor), offers enriched (that fetched
 * from findbolig.nu), LLM calls, listing pages fetched, then milliseconds: the listing phase (wall
 * time), the enrichment phase (wall time from the end of the listing until the last enrichment
 * settles, the critical path through findbolig.nu and the slowest LLM call), the total, summed LLM
 * (including any wait for the server's LLM cap) and summed findbolig.nu. Counts and timings only,
 * never anything about the offers themselves.
 */

/** Page size for walking the listing. */
export const DELTA_PAGE_SIZE = 25;

/** Where a walk picks up from; see the cursor rule above. */
export type ListingCursor = { since: string; sinceIds: string[] };

/** What an enricher returns when findbolig.nu answered but there is nothing to build. */
export const gone = Symbol("gone");

/** What a walk hands its enricher; see the limit rule above. */
export type EnrichTools = {
  /** Runs findbolig.nu calls under the Connection's limit, timed. */
  findbolig<R>(task: () => Promise<R>): Promise<R>;
  /** Runs one LLM call, timed and counted. */
  llm<R>(task: () => Promise<R>): Promise<R>;
};

/** Turns a changed offer into an item, or `gone`. Throwing counts as failed, unless it is an `UpstreamError`. */
export type Enrich<T> = (offer: ApiOffer, tools: EnrichTools) => Promise<T | typeof gone>;

export type ListingView<T> = {
  /** What the summary line calls this view. */
  name: string;
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
  const startedAt = performance.now();
  const stats = {
    walked: 0,
    enriched: 0,
    llmCalls: 0,
    listingPages: 0,
    listingMs: 0,
    enrichMs: 0,
    llmMs: 0,
    findboligMs: 0,
  };
  const timed = async <R>(task: () => Promise<R>, record: (ms: number) => void): Promise<R> => {
    const start = performance.now();
    try {
      return await task();
    } finally {
      record(performance.now() - start);
    }
  };
  const fetchListingPage = (page: number) =>
    limitedFor(client, () => {
      stats.listingPages++;
      return timed(
        () => client.searchOffers({ page, pageSize: DELTA_PAGE_SIZE, orderBy: "updated", orderDirection: "desc" }),
        (ms) => (stats.findboligMs += ms),
      );
    });

  let ended: ConnectionEnded | null = null;
  const tools: EnrichTools = {
    findbolig: (task) =>
      limitedFor(client, () => {
        // Once the Connection has ended, the rest is not worth asking findbolig.nu for.
        if (ended) throw ended;
        stats.enriched++;
        return timed(task, (ms) => (stats.findboligMs += ms));
      }),
    llm: (task) => (stats.llmCalls++, timed(task, (ms) => (stats.llmMs += ms))),
  };

  try {
    const { changed, latestUpdated, latestUpdatedIds } = await timed(
      () => collectChanged(cursor, fetchListingPage),
      (ms) => (stats.listingMs = ms),
    );

    const belonging = changed.filter((offer) => view.belongs(offer));
    const removedIds = changed.filter((offer) => !view.belongs(offer)).map((offer) => offer.id);
    stats.walked = changed.length;

    const enrich = async (offer: ApiOffer): Promise<Outcome<T>> => {
      if (ended) return { kind: "failed" };
      try {
        const item = await view.enrich(offer, tools);
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
    const outcomes = await timed(
      () => Promise.all(belonging.map(enrich)),
      (ms) => (stats.enrichMs = ms),
    );
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
  } finally {
    const ms = (n: number) => Math.round(n);
    console.info(
      `[walk] ${view.name} ${cursor ? "delta" : "sync"} walked=${stats.walked} enriched=${stats.enriched} ` +
        `llmCalls=${stats.llmCalls} listingPages=${stats.listingPages} listingMs=${ms(stats.listingMs)} ` +
        `enrichMs=${ms(stats.enrichMs)} totalMs=${ms(performance.now() - startedAt)} ` +
        `llmMs=${ms(stats.llmMs)} findboligMs=${ms(stats.findboligMs)}`,
    );
  }
}

/** Collects what changed in the listing since the cursor, paging by the paging rule above. */
async function collectChanged(cursor: ListingCursor | null, fetchPage: (page: number) => Promise<ApiOffersPage>) {
  const sinceMs = cursor ? new Date(cursor.since).getTime() : -Infinity;
  const sinceIds = new Set(cursor?.sinceIds ?? []);
  const changed: ApiOffer[] = [];
  const seen = new Set<string>();
  const latestUpdatedIds: string[] = [];
  const pageCount = ({ totalResults }: ApiOffersPage) => Math.ceil(totalResults / DELTA_PAGE_SIZE);

  const first = await fetchPage(0);
  const latestUpdated = first.results[0]?.updated ?? null;
  const done = () => ({ changed, latestUpdated, latestUpdatedIds });

  /** Collects one page's changed offers; false once it reaches an offer older than the cursor. */
  const collectPage = ({ results }: ApiOffersPage): boolean => {
    for (const offer of results) {
      const offerMs = new Date(offer.updated).getTime();
      // Sorted desc: once one is this old, everything after it is too.
      if (offerMs < sinceMs) return false;

      if (offer.updated === latestUpdated) latestUpdatedIds.push(offer.id);

      const alreadyReported = offerMs === sinceMs && sinceIds.has(offer.id);
      if (!alreadyReported && !seen.has(offer.id)) {
        seen.add(offer.id);
        changed.push(offer);
      }
    }
    return true;
  };

  if (!cursor) {
    // No cursor, so no offer is older than it: every page is collected in full.
    const rest = await Promise.all(Array.from({ length: pageCount(first) - 1 }, (_, i) => fetchPage(i + 1)));
    [first, ...rest].forEach(collectPage);
    return done();
  }

  let page = first;
  for (let next = 1; collectPage(page) && page.results.length > 0 && next < pageCount(page); next++) {
    page = await fetchPage(next);
  }
  return done();
}
