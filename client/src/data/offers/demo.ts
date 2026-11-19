import type { Offer, OfferDelta } from "@/types";
import MOCK_OFFERS from "~/data/MOCK_OFFERS.json";
import { demoCursor, demoDelay, noChanges } from "~/data/demo";
import { inDays } from "~/lib/dateHelper";
import type { OffersSource } from "./source";

/**
 * Sample offers for the Demo, with deadlines and move-in dates kept relative to today, showing
 * every state Tilbud has: offers to answer (one due tomorrow, one the landlord edited), one whose
 * deadline passed unanswered (Udløbet), and one accepted. The first cheap check moves the user up
 * the queue on one and lets another go to someone else (Udlejet), so the bell and Afsluttet have
 * something too. Answers stick until the page reloads.
 */
export function demoOffers(): OffersSource {
  const deadlines = [inDays(1), inDays(5), inDays(10), inDays(-2), inDays(5)];
  const moveIns = [inDays(30), inDays(45), inDays(60)];
  let offers = (MOCK_OFFERS as Offer[]).map((offer, i) => ({
    ...offer,
    deadline: deadlines[i % deadlines.length],
    availableFrom: moveIns[i % moveIns.length],
    editedByLandlord: i === 1,
  }));
  let scripted = false;

  return {
    async fetchActive() {
      await demoDelay(800);
      return { offers, ...demoCursor() };
    },
    async fetchDelta(): Promise<OfferDelta> {
      if (scripted) return noChanges<Offer>();
      scripted = true;
      const [, edited, rented] = offers;
      const moved = { ...edited, position: edited.position != null ? Math.max(1, edited.position - 3) : 12 };
      offers = offers.filter((o) => o !== rented).map((o) => (o.id === moved.id ? moved : o));
      return { ...noChanges<Offer>(), ...demoCursor(), items: [moved], removedIds: [rented.id], removedStates: { [rented.id]: "AwardedExternally" } };
    },
    async respond(offerId, answer) {
      const recipientState = answer === "accept" ? "OfferAccepted" : "OfferDeclined";
      offers = offers.map((o) => (o.id === offerId ? { ...o, recipientState } : o));
      return recipientState;
    },
  };
}
