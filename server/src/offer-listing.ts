import type { Delta } from "@/types";
import { ConnectionEnded, UpstreamError } from "~/lib/errors";
import type { FindboligClient } from "~/lib/findbolig-client";
import { limitedFor } from "~/lib/limiter";
import type { ApiOffer } from "~/types/offers";
import type { ApiThreadSummary } from "~/types/threads";

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
 * ## The thread walk
 * A new message in an offer's thread does not move the offer's `updated`, so a view that reads
 * threads (appointments) also walks findbolig.nu's thread list, newest `lastMessage.created` first,
 * from a thread cursor of its own. It is the same rule over `lastMessage.created` and thread ids,
 * handed out as `threadCursor`. A delta enriches every offer changed in either walk, once: offers
 * the listing walk did not find are fetched in one `searchOffers` by id. Threads with no offer are
 * left out. A full sync enriches every offer anyway, so it walks the thread list only for the next
 * thread cursor, before any enrichment starts: a message arriving mid-sync is caught by the next
 * delta. A thread list with no message in it hands back the thread cursor it was walked from.
 * Either way, each enrichment is told when the newest message of its offer's thread was sent, as
 * far as the walk read the thread list (`ThreadSeen`), so it can skip a thread nothing arrived in.
 *
 * ## Paging
 * Both page by `totalResults`, so no change is silently lost. A delta fetches one page at a time
 * and stops at the cursor. A full sync fetches page 0 for `totalResults`, then every other page
 * at once. The thread list pages the same way. Listing and thread pages are findbolig.nu calls, so
 * they run under the Connection's limit too, and a failing page fails the walk.
 *
 * ## The failure rule
 * Each changed offer that belongs in the view is enriched, with one of three outcomes:
 * - **ok**: the enricher built an item; it is reported in `items`.
 * - **gone**: findbolig.nu answered, but there is nothing to build: the enricher returned `gone`
 *   (no residence, no thread) or a required part was refused with an `UpstreamError`. The offer is
 *   reported in `removedIds` and the cursor advances.
 * - **failed**: anything else thrown, which is transient: findbolig.nu unavailable for a required
 *   part, or the LLM erroring. The offer is left out and **both** cursors are **withheld**
 *   (`latestUpdated` and `threadCursor` null), so the client keeps what it has and asks for the same
 *   changes again.
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
 * from findbolig.nu), LLM calls, thread list pages and listing pages fetched (the by-id fetch counts
 * as a listing page), then milliseconds: the listing phase (wall time, the thread walk included),
 * the enrichment phase (wall time from the end of the listing until the last enrichment
 * settles, the critical path through findbolig.nu and the slowest LLM call), the total, summed LLM
 * (including any wait for the server's LLM cap) and summed findbolig.nu. Counts and timings only,
 * never anything about the offers themselves.
 */

/** Page size for walking the listing. */
export const DELTA_PAGE_SIZE = 25;

/** Page size for walking the thread list: findbolig.nu refuses 200. */
export const THREAD_PAGE_SIZE = 100;

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

/** What the thread walk read of a changed offer's thread. */
export type ThreadSeen = {
  /**
   * When the newest message in the offer's thread was sent, as the thread list has it. Null when
   * the walk did not read it: a view that walks no threads, or a delta whose thread walk stopped
   * at the cursor before that thread.
   */
  lastMessageAt: string | null;
};

/** Turns a changed offer into an item, or `gone`. Throwing counts as failed, unless it is an `UpstreamError`. */
export type Enrich<T> = (offer: ApiOffer, tools: EnrichTools, thread: ThreadSeen) => Promise<T | typeof gone>;

export type ListingView<T> = {
  /** What the summary line calls this view. */
  name: string;
  /** Whether a changed offer belongs in this view at all. */
  belongs(offer: ApiOffer): boolean;
  enrich: Enrich<T>;
  /** Whether a walk also walks the thread list; see the thread walk above. */
  walksThreads?: boolean;
};

/** A walk's delta, plus the next thread cursor: null when withheld, or when the view walks no threads. */
export type Walked<T> = Delta<T> & { threadCursor: ListingCursor | null };

type Outcome<T> = { kind: "ok"; item: T } | { kind: "gone" } | { kind: "failed" };

/**
 * Walks the listing from `cursor` (or all of it), enriching what changed by the failure rule above.
 * A delta of a view that walks threads also needs its `threadCursor`.
 */
export async function walkOfferListing<T>(
  client: FindboligClient,
  cursor: ListingCursor | null,
  view: ListingView<T>,
  threadCursor: ListingCursor | null = null,
): Promise<Walked<T>> {
  if (cursor && view.walksThreads && !threadCursor) throw new Error(`A ${view.name} delta needs a thread cursor`);
  const startedAt = performance.now();
  const stats = {
    walked: 0,
    enriched: 0,
    llmCalls: 0,
    threadPages: 0,
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
  const fetchThreadPage = (page: number) =>
    limitedFor(client, () => {
      stats.threadPages++;
      return timed(() => client.listThreads({ page, pageSize: THREAD_PAGE_SIZE }), (ms) => (stats.findboligMs += ms));
    });
  const fetchOffersById = (ids: string[]) =>
    limitedFor(client, () => {
      stats.listingPages++;
      return timed(() => client.searchOffers({ filters: { id: ids }, pageSize: ids.length }), (ms) => (stats.findboligMs += ms));
    });

  /** Collects the offers changed in either walk, each once, by the thread walk rule above. */
  const collectChanged = async () => {
    const [listing, threads] = await Promise.all([
      collectSince(cursor, fetchListingPage, DELTA_PAGE_SIZE, (offer: ApiOffer) => ({ id: offer.id, at: offer.updated })),
      view.walksThreads
        ? collectSince(threadCursor, fetchThreadPage, THREAD_PAGE_SIZE, (thread: ApiThreadSummary) => ({
            id: thread.id,
            at: thread.lastMessage?.created ?? null,
          }))
        : null,
    ]);
    // A thread list with no message in it has nothing newer than the cursor a delta was given.
    const nextThreadCursor = threads?.latest ? { since: threads.latest, sinceIds: threads.latestIds } : threadCursor;
    const lastMessageAt = new Map<string, string>();
    for (const { relatedEntity, relatedEntityType, lastMessage } of threads?.changed ?? []) {
      if (relatedEntity && relatedEntityType === "Offer" && lastMessage) lastMessageAt.set(relatedEntity, lastMessage.created);
    }
    if (!cursor || !threads) return { listing, threadCursor: nextThreadCursor, lastMessageAt, changed: listing.changed };

    const listed = new Set(listing.changed.map((offer) => offer.id));
    const threadOnly = new Set<string>();
    for (const { relatedEntity, relatedEntityType } of threads.changed) {
      if (relatedEntity && relatedEntityType === "Offer" && !listed.has(relatedEntity)) threadOnly.add(relatedEntity);
    }
    const fetched = threadOnly.size > 0 ? (await fetchOffersById([...threadOnly])).results : [];
    return { listing, threadCursor: nextThreadCursor, lastMessageAt, changed: [...listing.changed, ...fetched] };
  };

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
    const { changed, listing, threadCursor: nextThreadCursor, lastMessageAt } = await timed(collectChanged, (ms) => (stats.listingMs = ms));

    const belonging = changed.filter((offer) => view.belongs(offer));
    const removedIds = changed.filter((offer) => !view.belongs(offer)).map((offer) => offer.id);
    stats.walked = changed.length;

    const enrich = async (offer: ApiOffer): Promise<Outcome<T>> => {
      if (ended) return { kind: "failed" };
      try {
        const item = await view.enrich(offer, tools, { lastMessageAt: lastMessageAt.get(offer.id) ?? null });
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
      ? { items, removedIds, latestUpdated: null, latestUpdatedIds: [], threadCursor: null }
      : { items, removedIds, latestUpdated: listing.latest, latestUpdatedIds: listing.latestIds, threadCursor: nextThreadCursor };
  } finally {
    const ms = (n: number) => Math.round(n);
    console.info(
      `[walk] ${view.name} ${cursor ? "delta" : "sync"} walked=${stats.walked} enriched=${stats.enriched} ` +
        `llmCalls=${stats.llmCalls} threadPages=${stats.threadPages} listingPages=${stats.listingPages} listingMs=${ms(stats.listingMs)} ` +
        `enrichMs=${ms(stats.enrichMs)} totalMs=${ms(performance.now() - startedAt)} ` +
        `llmMs=${ms(stats.llmMs)} findboligMs=${ms(stats.findboligMs)}`,
    );
  }
}

/** One page of a listing walked newest first. */
type Page<R> = { totalResults: number; results: R[] };

/**
 * Collects the rows of a newest-first listing changed since the cursor, paging by the paging rule
 * above, and the next cursor. `stamp` says what the cursor reads of a row: its id and its timestamp.
 * A row with no timestamp (a thread with no message) is never changed.
 */
async function collectSince<R>(
  cursor: ListingCursor | null,
  fetchPage: (page: number) => Promise<Page<R>>,
  pageSize: number,
  stamp: (row: R) => { id: string; at: string | null },
) {
  const sinceMs = cursor ? new Date(cursor.since).getTime() : -Infinity;
  const sinceIds = new Set(cursor?.sinceIds ?? []);
  const changed: R[] = [];
  const seen = new Set<string>();
  const latestIds: string[] = [];
  const pageCount = ({ totalResults }: Page<R>) => Math.ceil(totalResults / pageSize);

  const first = await fetchPage(0);
  const latest = first.results.map((row) => stamp(row).at).find((at) => at !== null) ?? null;
  const done = () => ({ changed, latest, latestIds });

  /** Collects one page's changed rows; false once it reaches a row older than the cursor. */
  const collectPage = ({ results }: Page<R>): boolean => {
    for (const row of results) {
      const { id, at } = stamp(row);
      if (at === null) continue;
      const rowMs = new Date(at).getTime();
      // Sorted desc: once one is this old, everything after it is too.
      if (rowMs < sinceMs) return false;

      if (at === latest) latestIds.push(id);

      const alreadyReported = rowMs === sinceMs && sinceIds.has(id);
      if (!alreadyReported && !seen.has(id)) {
        seen.add(id);
        changed.push(row);
      }
    }
    return true;
  };

  if (!cursor) {
    // No cursor, so no row is older than it: every page is collected in full.
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
