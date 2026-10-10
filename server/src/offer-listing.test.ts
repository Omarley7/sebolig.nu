import { test } from "node:test";
import assert from "node:assert/strict";

import { ConnectionEnded, FindboligUnavailable, UpstreamError } from "./lib/errors";
import { FindboligClient } from "./lib/findbolig-client";
import { FakeFindbolig } from "./lib/fake-findbolig";
import { DELTA_PAGE_SIZE, gone, walkOfferListing, type Enrich } from "./offer-listing";
import type { ApiOffer } from "./types/offers";

type MinimalOffer = Pick<ApiOffer, "id" | "updated"> & Partial<ApiOffer>;

/** A client connected to a fake findbolig.nu whose `/api/search/offers` pages over a fixed, updated-desc-sorted dataset. */
function clientWithOffers(dataset: MinimalOffer[]) {
  const fake = new FakeFindbolig()
    .addAccount("tenant@example.com", "pw", "Test Tenant")
    .on("POST /api/search/offers", (req) => {
      const body = req.body as { page?: number; pageSize?: number };
      const page = body.page ?? 0;
      const pageSize = body.pageSize ?? DELTA_PAGE_SIZE;
      const start = page * pageSize;
      return {
        json: { facets: {}, totalResults: dataset.length, page, pageSize, results: dataset.slice(start, start + pageSize) },
      };
    });
  return FindboligClient.connect(fake, "tenant@example.com", "pw");
}

function offer(id: string, updated: string, overrides: Partial<ApiOffer> = {}): MinimalOffer {
  return { id, updated, ...overrides };
}

/** Every offer belongs and enriches to its own id. */
const byId = { belongs: () => true, enrich: async (o: ApiOffer) => o.id };

const ids = (items: string[]) => [...items].sort();

test("a same-timestamp batch larger than one page is collected in full", async () => {
  const T = "2026-01-10T12:00:00.000Z";
  // 30 offers touched at the exact same instant: more than one page, so the walk must span two.
  const batch = Array.from({ length: 30 }, (_, i) => offer(`batch-${i}`, T));
  const client = await clientWithOffers([...batch, offer("old-1", "2026-01-05T00:00:00.000Z")]);

  const delta = await walkOfferListing(client, { since: "2026-01-06T00:00:00.000Z", sinceIds: [] }, byId);

  assert.equal(delta.items.length, 30, "every offer in the equal-timestamp batch must be collected");
  assert.equal(delta.latestUpdated, T);
  assert.deepEqual(ids(delta.latestUpdatedIds), ids(batch.map((o) => o.id)), "latestUpdatedIds must name every offer at the cursor");
});

test("a repeat call with the same cursor does not re-report already-seen offers", async () => {
  const T = "2026-01-10T12:00:00.000Z";
  const batch = Array.from({ length: 30 }, (_, i) => offer(`batch-${i}`, T));
  const client = await clientWithOffers(batch);

  const delta = await walkOfferListing(client, { since: T, sinceIds: batch.map((o) => o.id) }, byId);

  assert.deepEqual(delta.items, [], "nothing new happened; the cursor must not resend the same batch");
  assert.deepEqual(delta.removedIds, []);
  assert.equal(delta.latestUpdated, T);
  assert.deepEqual(ids(delta.latestUpdatedIds), ids(batch.map((o) => o.id)));
});

test("a new offer landing on the exact timestamp of the cursor is never dropped", async () => {
  const T = "2026-01-10T12:00:00.000Z";
  const previouslySeen = Array.from({ length: 5 }, (_, i) => offer(`seen-${i}`, T));
  // Put the new arrival first, as if findbolig.nu's tie-break order shifted between calls.
  const client = await clientWithOffers([offer("new-arrival", T), ...previouslySeen]);

  const delta = await walkOfferListing(client, { since: T, sinceIds: previouslySeen.map((o) => o.id) }, byId);

  assert.deepEqual(delta.items, ["new-arrival"], "an id absent from sinceIds is reported even though its timestamp matches");
  assert.ok(delta.latestUpdatedIds.includes("new-arrival"));
  assert.equal(delta.latestUpdatedIds.length, 6);
});

test("offers strictly older than the cursor are excluded and stop the walk", async () => {
  const since = "2026-01-05T00:00:00.000Z";
  const client = await clientWithOffers([
    offer("new-1", "2026-01-10T00:00:00.000Z"),
    offer("boundary", since),
    offer("too-old", "2026-01-01T00:00:00.000Z"),
  ]);

  const delta = await walkOfferListing(client, { since, sinceIds: [] }, byId);

  assert.deepEqual(delta.items, ["new-1", "boundary"]);
  assert.equal(delta.latestUpdated, "2026-01-10T00:00:00.000Z");
});

test("a walk with no cursor collects the whole listing in pages and still hands out latestUpdatedIds", async () => {
  const T = "2026-01-10T12:00:00.000Z";
  const dataset = [
    offer("a", T),
    offer("b", T),
    ...Array.from({ length: 40 }, (_, i) => offer(`older-${i}`, `2025-12-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`)),
  ];
  const client = await clientWithOffers(dataset);

  const delta = await walkOfferListing(client, null, byId);

  assert.equal(delta.items.length, 42);
  assert.equal(delta.latestUpdated, T);
  assert.deepEqual(ids(delta.latestUpdatedIds), ["a", "b"]);
});

test("changed offers that don't belong in the view are reported as removed, without being enriched", async () => {
  const T = "2026-01-10T00:00:00.000Z";
  const client = await clientWithOffers([offer("kept", T, { state: "Published" }), offer("expired", T, { state: "Expired" })]);
  const enriched: string[] = [];

  const delta = await walkOfferListing(client, null, {
    belongs: (o) => o.state === "Published",
    enrich: async (o) => (enriched.push(o.id), o.id),
  });

  assert.deepEqual(delta.items, ["kept"]);
  assert.deepEqual(delta.removedIds, ["expired"]);
  assert.deepEqual(enriched, ["kept"]);
});

test("an offer whose enrichment is gone is reported as removed, and the cursor still advances", async () => {
  const T = "2026-01-10T00:00:00.000Z";
  const client = await clientWithOffers([offer("ok", T), offer("no-residence", T), offer("refused", T)]);
  const enrich: Enrich<string> = async (o) => {
    if (o.id === "no-residence") return gone;
    if (o.id === "refused") throw new UpstreamError("Failed to fetch residence", 404);
    return o.id;
  };

  const delta = await walkOfferListing(client, { since: "2026-01-01T00:00:00.000Z", sinceIds: [] }, { belongs: () => true, enrich });

  assert.deepEqual(delta.items, ["ok"]);
  assert.deepEqual(ids(delta.removedIds), ["no-residence", "refused"]);
  assert.equal(delta.latestUpdated, T);
  assert.equal(delta.latestUpdatedIds.length, 3);
});

for (const [what, error] of [
  ["findbolig.nu being unavailable", new FindboligUnavailable("Failed to fetch residence", { status: 503 })],
  ["the LLM erroring", new Error("OpenAI: 429 Too Many Requests")],
] as const) {
  test(`an enrichment failing on ${what} leaves the offer out and withholds the cursor`, async () => {
    const T = "2026-01-10T00:00:00.000Z";
    const client = await clientWithOffers([offer("ok", T), offer("flaky", T)]);
    const enrich: Enrich<string> = async (o) => {
      if (o.id === "flaky") throw error;
      return o.id;
    };

    const delta = await walkOfferListing(client, { since: "2026-01-01T00:00:00.000Z", sinceIds: [] }, { belongs: () => true, enrich });

    assert.deepEqual(delta.items, ["ok"]);
    assert.deepEqual(delta.removedIds, [], "a failed offer is not removed: the client keeps what it has");
    assert.equal(delta.latestUpdated, null, "the cursor must be withheld so the client asks again");
    assert.deepEqual(delta.latestUpdatedIds, []);
  });
}

test("an ended Connection during enrichment fails the whole walk", async () => {
  const T = "2026-01-10T00:00:00.000Z";
  const client = await clientWithOffers([offer("ok", T), offer("ended", T)]);
  const enrich: Enrich<string> = async (o) => {
    if (o.id === "ended") throw new ConnectionEnded("credentials_rejected");
    return o.id;
  };

  await assert.rejects(walkOfferListing(client, null, { belongs: () => true, enrich }), ConnectionEnded);
});

test("no more than five enrichments per Connection are in flight at once, even across concurrent walks", async () => {
  const T = "2026-01-10T00:00:00.000Z";
  const client = await clientWithOffers(Array.from({ length: 12 }, (_, i) => offer(`o-${i}`, T)));
  let inFlight = 0;
  let peak = 0;
  const view = {
    belongs: () => true,
    enrich: async (o: ApiOffer) => {
      peak = Math.max(peak, ++inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight--;
      return o.id;
    },
  };

  // The dashboard loads offers and appointments at the same moment: two walks for one Connection.
  const [offers, appointments] = await Promise.all([walkOfferListing(client, null, view), walkOfferListing(client, null, view)]);

  assert.equal(peak, 5);
  assert.equal(offers.items.length + appointments.items.length, 24);
});
