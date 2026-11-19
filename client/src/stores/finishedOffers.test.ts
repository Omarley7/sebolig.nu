import type { Offer } from "@/types";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { OffersSource } from "~/data/offers/source";
import { finishedOffersStore, trackFinishedOffers } from "~/localData/finishedOffers";
import { offersKind } from "~/localData/offers";
import { localDataHarness, type HarnessOptions } from "~/test/localDataHarness";

const DAY = 24 * 60 * 60 * 1000;
const CURSOR = { latestUpdated: "2026-11-01T00:00:00Z", latestUpdatedIds: [] };

function offer(id: string, fields: Partial<Offer> = {}): Offer {
  return {
    id,
    residence: { addressLine1: `Vej ${id}`, addressLine2: null, location: null },
    deadline: null,
    availableFrom: null,
    rooms: null,
    area: null,
    recipientState: "OfferReceived",
    company: "",
    financials: { monthlyRentIncludingAconto: 8000, monthlyRentExcludingAconto: 7500, utilityCosts: 500, deposit: 24000, prepaidRent: 0, firstPayment: 32000 },
    imageUrl: "img",
    images: [],
    blueprints: [],
    position: 3,
    ...fields,
  };
}

/** An offers store holding `stored`, whose next check removes `removedStates`' offers, tracked into a finished-offers list. */
function setup(removedStates: Record<string, string>, stored: Offer[], options: HarnessOptions = {}) {
  const harness = localDataHarness({
    ...options,
    stored: { offers_cache: { updatedAt: "2026-11-01T00:00:00Z", offers: stored, ...CURSOR }, ...options.stored },
  });
  const source: OffersSource = {
    fetchActive: async () => ({ offers: [], ...CURSOR }),
    fetchDelta: async () => ({ items: [], removedIds: Object.keys(removedStates), removedStates, ...CURSOR }),
    respond: async () => "OfferAccepted",
  };
  const offers = harness.localData.define(offersKind({ live: source, demo: source }))();
  const finished = finishedOffersStore(harness.localData.keep("finishedOffers"))();
  trackFinishedOffers({ offers, finished });
  return { ...harness, offers, finished };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-19T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

it("keeps an offer that left the offers list, as it was, with why and when it left", async () => {
  const { offers, finished } = setup({ a: "AwardedExternally" }, [offer("a"), offer("b")]);

  await offers.init();

  expect(finished.offers).toEqual([{ offer: offer("a"), state: "AwardedExternally", at: "2026-11-19T12:00:00.000Z" }]);
});

it("is still there after a reload, and goes after 30 days", async () => {
  const first = setup({ a: "Released" }, [offer("a")]);
  await first.offers.init();
  const stored = first.readStored("finishedOffers");

  setActivePinia(createPinia());
  const reloaded = setup({}, [], { stored: { finishedOffers: stored } });
  expect(reloaded.finished.offers.map((f) => f.offer.id)).toEqual(["a"]);

  vi.setSystemTime(new Date(Date.now() + 31 * DAY));
  setActivePinia(createPinia());
  const later = setup({}, [], { stored: { finishedOffers: stored } });
  expect(later.finished.offers).toEqual([]);
});

it("is erased with the rest of Local data on disconnect", async () => {
  const { offers, finished, localData } = setup({ a: "Awarded" }, [offer("a")]);
  await offers.init();

  localData.eraseAll();

  expect(finished.offers).toEqual([]);
});
