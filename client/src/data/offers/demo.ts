import type { Offer } from "@/types";
import MOCK_OFFERS from "~/data/MOCK_OFFERS.json";
import { demoCursor, demoDelay, noChanges } from "~/data/demo";
import { inDays } from "~/lib/dateHelper";
import type { OffersSource } from "./source";

/** Sample offers for the Demo, with deadlines kept relative to today. Answers stick until the page reloads. */
export function demoOffers(): OffersSource {
  const deadlines = [inDays(1), inDays(5), inDays(10)];
  let offers = (MOCK_OFFERS as Offer[]).map((offer, i) => ({ ...offer, deadline: deadlines[i % deadlines.length] }));

  return {
    async fetchActive() {
      await demoDelay(800);
      return { offers, latestUpdated: demoCursor().latestUpdated };
    },
    fetchDelta: async () => noChanges<Offer>(),
    async respond(offerId, answer) {
      const recipientState = answer === "accept" ? "OfferAccepted" : "OfferDeclined";
      offers = offers.map((o) => (o.id === offerId ? { ...o, recipientState } : o));
      return recipientState;
    },
  };
}
