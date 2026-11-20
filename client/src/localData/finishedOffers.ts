import type { Offer } from "@/types";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { KeptData, Update } from "~/lib/localData";
import type { FinishedOffer } from "~/lib/offerTabs";
import type { CursorData } from "./delta";

/** How long an offer that left the list stays in Afsluttet. */
const KEPT_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The offers that left the offers list (rented to someone else, withdrawn, ended), as they were
 * when they left, so Tilbud's Afsluttet tab can still show them. The offers list drops them, and
 * the changes log keeps them only as long as the change. Kept as Local data under its own key
 * (`kept`), so it is erased on disconnect; each offer is kept 30 days.
 */
export function finishedOffersStore(kept: KeptData) {
  return defineStore("finishedOffers", () => {
    const list = ref<FinishedOffer[]>([]);

    const fresh = (entry: FinishedOffer, now: Date) => now.getTime() - new Date(entry.at).getTime() <= KEPT_MS;

    function load() {
      try {
        const stored = JSON.parse(kept.read() ?? "null") as FinishedOffer[] | null;
        const now = new Date();
        list.value = Array.isArray(stored) ? stored.filter((entry) => fresh(entry, now)) : [];
      } catch {
        list.value = [];
      }
    }

    /** Keeps the offers that left in a check, replacing an earlier copy of the same offer. */
    function record(left: Omit<FinishedOffer, "at">[]) {
      if (left.length === 0) return;
      const now = new Date();
      const ids = new Set(left.map((entry) => entry.offer.id));
      list.value = [
        ...left.map((entry) => ({ ...entry, at: now.toISOString() })),
        ...list.value.filter((entry) => !ids.has(entry.offer.id) && fresh(entry, now)),
      ];
      kept.write(JSON.stringify(list.value));
    }

    kept.onErase(() => {
      list.value = [];
    });

    load();

    return {
      /** Every offer still kept, newest first. */
      offers: computed(() => list.value),
      record,
    };
  });
}

/**
 * Has each check of offers keep the offers that left in the finished-offers list. A full fetch that
 * withheld its cursor left out offers it failed to fetch: their absence is not taken as leaving.
 */
export function trackFinishedOffers({
  offers,
  finished,
}: {
  offers: { onUpdated(listener: (update: Update<CursorData<Offer>>) => void): void };
  finished: { record(left: Omit<FinishedOffer, "at">[]): void };
}) {
  offers.onUpdated(({ before, after }) => {
    if (after.cursor === null) return;
    const still = new Set(after.items.map((offer) => offer.id));
    const states = after.removedStates ?? {};
    finished.record(before.items.filter((offer) => !still.has(offer.id)).map((offer) => ({ offer, state: states[offer.id] ?? null })));
  });
}
