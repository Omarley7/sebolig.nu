import { test } from "node:test";
import assert from "node:assert/strict";

import { getActiveOffers, getOffersUpdatedSince } from "./findbolig-service";
import { ConnectionEnded } from "./lib/errors";
import { FindboligClient } from "./lib/findbolig-client";
import { FakeFindbolig } from "./lib/fake-findbolig";
import type { ApiOffer } from "./types/offers";

// Must match DELTA_PAGE_SIZE in findbolig-service.ts.
const DELTA_PAGE_SIZE = 25;

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
  const client = await clientWithOffers([...batch, ...older]);

  const { changed, latestUpdated, latestUpdatedIds } = await getOffersUpdatedSince(client, before);
  assert.equal(changed.length, 30, "every offer in the equal-timestamp batch must be collected");
  assert.equal(latestUpdated, T);
  assert.equal(latestUpdatedIds.length, 30);
  assert.deepEqual(
    new Set(latestUpdatedIds),
    new Set(batch.map((o) => o.id)),
    "latestUpdatedIds must name every offer at the cursor timestamp",
  );
});

test("getOffersUpdatedSince: a repeat call with the same cursor does not re-report already-seen items", async () => {
  const T = "2026-01-10T12:00:00.000Z";
  const batch = Array.from({ length: 30 }, (_, i) => offer(`batch-${i}`, T));
  const client = await clientWithOffers(batch);

  const { changed, latestUpdated, latestUpdatedIds } = await getOffersUpdatedSince(
    client,
    T,
    batch.map((o) => o.id),
  );
  assert.deepEqual(changed, [], "nothing new happened — the composite cursor must not resend the same batch");
  assert.equal(latestUpdated, T);
  assert.deepEqual(new Set(latestUpdatedIds), new Set(batch.map((o) => o.id)));
});

test("getOffersUpdatedSince: a new offer landing on the exact same timestamp as the cursor is never dropped", async () => {
  const T = "2026-01-10T12:00:00.000Z";
  const previouslySeen = Array.from({ length: 5 }, (_, i) => offer(`seen-${i}`, T));
  const newArrival = offer("new-arrival", T);
  // The new arrival can land anywhere relative to the others in the tie — put it first to
  // simulate the upstream API's tie-break order shifting between calls.
  const client = await clientWithOffers([newArrival, ...previouslySeen]);

  const { changed, latestUpdatedIds } = await getOffersUpdatedSince(
    client,
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
});

test("getOffersUpdatedSince: items strictly older than the cursor are excluded and stop the walk", async () => {
  const since = "2026-01-05T00:00:00.000Z";
  const dataset = [
    offer("new-1", "2026-01-10T00:00:00.000Z"),
    offer("boundary", since),
    offer("too-old", "2026-01-01T00:00:00.000Z"),
  ];
  const client = await clientWithOffers(dataset);

  const { changed, latestUpdated } = await getOffersUpdatedSince(client, since);
  assert.deepEqual(changed.map((o) => o.id), ["new-1", "boundary"]);
  assert.equal(latestUpdated, "2026-01-10T00:00:00.000Z");
});

test("an ended Connection during offer enrichment ends the request instead of dropping the offer", async () => {
  const fake = new FakeFindbolig()
    .addAccount("tenant@example.com", "pw", "Test Tenant")
    .on("POST /api/search/offers", () => ({
      json: { facets: {}, totalResults: 1, page: 0, pageSize: 1, results: [{ id: "o1", residenceId: "r1", state: "Published", updated: "2026-01-10T00:00:00.000Z" }] },
    }))
    // findbolig.nu keeps refusing the residence even with a fresh findbolig session.
    .on("GET /api/models/residence/r1", () => ({ status: 401 }))
    .on("GET /api/search/waiting-lists/applicants/position-on-offer/o1", () => ({ status: 401 }));
  const client = await FindboligClient.connect(fake, "tenant@example.com", "pw");

  await assert.rejects(getActiveOffers(client), ConnectionEnded);
});
