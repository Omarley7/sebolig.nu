import type { Offer } from "@/types";
import MOCK_OFFERS from "~/data/MOCK_OFFERS.json";
import { demoCursor, demoDelay, noChanges } from "~/data/demo";
import { inDays } from "~/lib/dateHelper";
import type { OffersSource } from "./source";

/** Sample offers for the Demo, with deadlines and move-in dates kept relative to today. Answers stick until the page reloads. */
export function demoOffers(): OffersSource {
  const deadlines = [inDays(1), inDays(5), inDays(10)];
  const moveIns = [inDays(30), inDays(45), inDays(60)];
  let offers = (MOCK_OFFERS as Offer[]).map((offer, i) => ({
    ...offer,
    deadline: deadlines[i % deadlines.length],
    availableFrom: moveIns[i % moveIns.length],
  }));

  return {
    async fetchActive() {
      await demoDelay(800);
      return { offers, ...demoCursor() };
    },
    fetchDelta: async () => noChanges<Offer>(),
    async respond(offerId, answer) {
      const recipientState = answer === "accept" ? "OfferAccepted" : "OfferDeclined";
      offers = offers.map((o) => (o.id === offerId ? { ...o, recipientState } : o));
      return recipientState;
    },
  };
}
