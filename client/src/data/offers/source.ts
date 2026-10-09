import type { Offer, OfferDelta, RecipientState } from "@/types";
import type { Cursor } from "~/data/cursor";

export type OfferAnswer = "accept" | "decline";

/** Where offers come from: findbolig.nu through our backend, or the Demo. */
export interface OffersSource {
  fetchActive(): Promise<{ offers: Offer[]; latestUpdated: string | null }>;
  /** Offers changed since a cursor this same source handed out earlier. */
  fetchDelta(cursor: Cursor): Promise<OfferDelta>;
  respond(offerId: string, answer: OfferAnswer): Promise<RecipientState>;
}
