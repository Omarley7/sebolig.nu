import type { Offer, OfferDelta, RecipientState } from "@/types";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, expect, it } from "vitest";
import type { Cursor } from "~/data/cursor";
import type { OffersSource } from "~/data/offers/source";
import { offersKind } from "~/localData/offers";
import { localDataHarness, type HarnessOptions } from "~/test/localDataHarness";

function offer(id: string, overrides: Partial<Offer> = {}): Offer {
  return {
    id,
    residence: { adressLine1: `Street ${id}`, adressLine2: "2100 København Ø", location: null as never },
    deadline: null,
    availableFrom: null,
    rooms: 2,
    area: 60,
    recipientState: "OfferReceived",
    company: "Housing Co",
    financials: {} as Offer["financials"],
    imageUrl: "",
    images: [],
    blueprints: [],
    position: 3,
    ...overrides,
  };
}

/** Today's stored format for offers_cache, written by the store before the Local data module. */
function storedOffers(offers: Offer[], cursor: { latestUpdated?: string | null; latestUpdatedIds?: string[] } = {}) {
  return { updatedAt: "2026-10-01T08:00:00.000Z", offers, ...cursor };
}

function fakeSource(overrides: Partial<OffersSource> = {}): OffersSource {
  return {
    fetchActive: async () => ({ offers: [], latestUpdated: null, latestUpdatedIds: [] }),
    fetchDelta: async () => ({ items: [], removedIds: [], latestUpdated: null, latestUpdatedIds: [] }),
    respond: async (_id, answer): Promise<RecipientState> => (answer === "accept" ? "OfferAccepted" : "OfferDeclined"),
    ...overrides,
  };
}

function setup(source: OffersSource, options: HarnessOptions = {}) {
  const harness = localDataHarness(options);
  const useOffers = harness.localData.define(offersKind({ live: source, demo: source }));
  return { ...harness, store: useOffers() };
}

beforeEach(() => {
  setActivePinia(createPinia());
});

it("the cheap check merges changed offers by id, drops removed ones and moves the cursor", async () => {
  const sinceSeen: Cursor[] = [];
  const delta: OfferDelta = {
    items: [offer("b", { position: 1 }), offer("c")],
    removedIds: ["a"],
    latestUpdated: "2026-10-02T00:00:00Z",
    latestUpdatedIds: ["c"],
  };
  const { store, readStored } = setup(
    fakeSource({
      fetchDelta: async (cursor) => (sinceSeen.push(cursor), delta),
    }),
    {
      stored: {
        offers_cache: storedOffers([offer("a"), offer("b")], {
          latestUpdated: "2026-10-01T00:00:00Z",
          latestUpdatedIds: ["b"],
        }),
      },
    },
  );

  await store.init();

  expect(sinceSeen).toEqual([{ latestUpdated: "2026-10-01T00:00:00Z", latestUpdatedIds: ["b"] }]);
  expect(store.offers.map((o) => [o.id, o.position])).toEqual([
    ["b", 1],
    ["c", 3],
  ]);
  expect(readStored("offers_cache")).toMatchObject({
    latestUpdated: "2026-10-02T00:00:00Z",
    latestUpdatedIds: ["c"],
  });
});

it("a delta without a cursor keeps the old one, so the same changes are asked for again", async () => {
  const { store, readStored } = setup(
    fakeSource({
      fetchDelta: async () => ({ items: [offer("a", { position: 1 })], removedIds: [], latestUpdated: null, latestUpdatedIds: [] }),
    }),
    { stored: { offers_cache: storedOffers([offer("a")], { latestUpdated: "2026-10-01T00:00:00Z", latestUpdatedIds: ["a"] }) } },
  );

  await store.init();

  expect(store.offers[0].position).toBe(1);
  expect(readStored("offers_cache")).toMatchObject({ latestUpdated: "2026-10-01T00:00:00Z", latestUpdatedIds: ["a"] });
});

it("offers stored before the delta cursor existed are replaced by one full refresh that seeds it, ids included", async () => {
  const { store, readStored } = setup(
    fakeSource({
      fetchActive: async () => ({ offers: [offer("z")], latestUpdated: "2026-10-03T00:00:00Z", latestUpdatedIds: ["z", "gone"] }),
    }),
    { stored: { offers_cache: storedOffers([offer("a")]) } },
  );

  await store.init();

  expect(store.offers.map((o) => o.id)).toEqual(["z"]);
  // Storing the ids keeps the next delta from re-reporting offers that share the cursor's timestamp.
  expect(readStored("offers_cache")).toMatchObject({ latestUpdated: "2026-10-03T00:00:00Z", latestUpdatedIds: ["z", "gone"] });
});

it("offers stored in today's format load as they are when there is no Connection", async () => {
  const { store } = setup(fakeSource(), {
    connected: false,
    stored: { offers_cache: storedOffers([offer("a")], { latestUpdated: "2026-10-01T00:00:00Z", latestUpdatedIds: ["a"] }) },
  });

  await store.init();

  expect(store.offers.map((o) => o.id)).toEqual(["a"]);
  expect(store.updatedAt).toEqual(new Date("2026-10-01T08:00:00.000Z"));
});

it("accepting an offer stores the state findbolig.nu answered with and confirms it", async () => {
  const { store, notices, readStored } = setup(fakeSource(), {
    stored: { offers_cache: storedOffers([offer("a")], { latestUpdated: "2026-10-01T00:00:00Z" }) },
  });
  await store.init();

  expect(await store.acceptOffer("a")).toBe(true);

  expect(store.offers[0].recipientState).toBe("OfferAccepted");
  expect(readStored("offers_cache").offers[0].recipientState).toBe("OfferAccepted");
  expect(notices).toEqual([{ level: "success", key: "offers.acceptSuccess" }]);
});

it("a refused answer to an offer changes nothing and says so", async () => {
  const { store, notices } = setup(
    fakeSource({
      respond: async () => {
        throw new Error("refused");
      },
    }),
    { stored: { offers_cache: storedOffers([offer("a")], { latestUpdated: "2026-10-01T00:00:00Z" }) } },
  );
  await store.init();

  expect(await store.declineOffer("a")).toBe(false);

  expect(store.offers[0].recipientState).toBe("OfferReceived");
  expect(notices).toEqual([{ level: "error", key: "offers.actionFailed", cause: expect.any(Error) }]);
});
