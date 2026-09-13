import { test } from "node:test";
import assert from "node:assert/strict";

// session.ts (pulled in transitively) throws at import time unless COOKIE_SECRET is set.
process.env.COOKIE_SECRET ||= "x".repeat(32);

const { getOffersUpdatedSince } = await import("./findbolig-service");

import type { ApiOffer } from "./types/offers";

// Must match DELTA_PAGE_SIZE in findbolig-service.ts.
const DELTA_PAGE_SIZE = 25;

type MinimalOffer = Pick<ApiOffer, "id" | "updated"> & Partial<ApiOffer>;

/** Installs a fake `/api/search/offers` responder over a fixed, updated-desc-sorted dataset. */
function mockOffersEndpoint(dataset: MinimalOffer[]) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const href = typeof url === "string" ? url : url.toString();
    if (!href.endsWith("/api/search/offers")) {
      throw new Error(`Unexpected fetch in test: ${href}`);
    }
    const body = JSON.parse((init?.body as string) ?? "{}");
    const page: number = body.page ?? 0;
    const pageSize: number = body.pageSize ?? DELTA_PAGE_SIZE;
    const start = page * pageSize;
    const results = dataset.slice(start, start + pageSize);
    return new Response(
      JSON.stringify({
        facets: {},
        totalResults: dataset.length,
        page,
        pageSize,
        results,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

function offer(id: string, updated: string): MinimalOffer {
  return { id, updated };
}

test("getOffersUpdatedSince: a same-timestamp batch larger than one page is collected in full", async () => {
  const T = "2026-01-10T12:00:00.000Z";
  const before = "2026-01-06T00:00:00.000Z";
  // 30 offers all touched at the exact same instant — bigger than DELTA_PAGE_SIZE (25),
  // so the walk must span two pages to see all of them.
  const batch = Array.from({ length: 30 }, (_, i) => offer(`batch-${i}`, T));
  const older = [offer("old-1", "2026-01-05T00:00:00.000Z")];
  const restore = mockOffersEndpoint([...batch, ...older]);

  try {
    const { changed, latestUpdated, latestUpdatedIds } = await getOffersUpdatedSince("cookie", before);
    assert.equal(changed.length, 30, "every offer in the equal-timestamp batch must be collected");
    assert.equal(latestUpdated, T);
    assert.equal(latestUpdatedIds.length, 30);
    assert.deepEqual(
      new Set(latestUpdatedIds),
      new Set(batch.map((o) => o.id)),
      "latestUpdatedIds must name every offer at the cursor timestamp",
    );
  } finally {
    restore();
  }
});

test("getOffersUpdatedSince: a repeat call with the same cursor does not re-report already-seen items", async () => {
  const T = "2026-01-10T12:00:00.000Z";
  const batch = Array.from({ length: 30 }, (_, i) => offer(`batch-${i}`, T));
  const restore = mockOffersEndpoint(batch);

  try {
    const { changed, latestUpdated, latestUpdatedIds } = await getOffersUpdatedSince(
      "cookie",
      T,
      batch.map((o) => o.id),
    );
    assert.deepEqual(changed, [], "nothing new happened — the composite cursor must not resend the same batch");
    assert.equal(latestUpdated, T);
    assert.deepEqual(new Set(latestUpdatedIds), new Set(batch.map((o) => o.id)));
  } finally {
    restore();
  }
});

test("getOffersUpdatedSince: a new offer landing on the exact same timestamp as the cursor is never dropped", async () => {
  const T = "2026-01-10T12:00:00.000Z";
  const previouslySeen = Array.from({ length: 5 }, (_, i) => offer(`seen-${i}`, T));
  const newArrival = offer("new-arrival", T);
  // The new arrival can land anywhere relative to the others in the tie — put it first to
  // simulate the upstream API's tie-break order shifting between calls.
  const restore = mockOffersEndpoint([newArrival, ...previouslySeen]);

  try {
    const { changed, latestUpdatedIds } = await getOffersUpdatedSince(
      "cookie",
      T,
      previouslySeen.map((o) => o.id),
    );
    assert.deepEqual(
      changed.map((o) => o.id),
      ["new-arrival"],
      "an id absent from sinceIds must be reported even though its timestamp matches the cursor exactly",
    );
    assert.ok(latestUpdatedIds.includes("new-arrival"));
    assert.equal(latestUpdatedIds.length, 6);
  } finally {
    restore();
  }
});

test("getOffersUpdatedSince: items strictly older than the cursor are excluded and stop the walk", async () => {
  const since = "2026-01-05T00:00:00.000Z";
  const dataset = [
    offer("new-1", "2026-01-10T00:00:00.000Z"),
    offer("boundary", since),
    offer("too-old", "2026-01-01T00:00:00.000Z"),
  ];
  const restore = mockOffersEndpoint(dataset);

  try {
    const { changed, latestUpdated } = await getOffersUpdatedSince("cookie", since);
    assert.deepEqual(changed.map((o) => o.id), ["new-1", "boundary"]);
    assert.equal(latestUpdated, "2026-01-10T00:00:00.000Z");
  } finally {
    restore();
  }
});
