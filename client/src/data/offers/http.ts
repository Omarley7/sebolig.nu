import type { Offer, OfferDelta, RecipientState } from "@/types";
import type { FullFetchCursor } from "~/data/cursor";
import { api, deltaQuery } from "~/data/http";
import type { OffersSource } from "./source";

const TIMEOUT_FETCH = 90_000;
const TIMEOUT_ACTION = 25_000;
const TIMEOUT_DELTA = 30_000;

export const httpOffers: OffersSource = {
  fetchActive: () =>
    api<{ offers: Offer[] } & FullFetchCursor>("/api/offers/active", {
      timeoutMs: TIMEOUT_FETCH,
      failureMessage: "Failed to fetch offers",
    }),

  fetchDelta: (cursor) =>
    api<OfferDelta>(`/api/offers/delta?${deltaQuery(cursor)}`, {
      timeoutMs: TIMEOUT_DELTA,
      failureMessage: "Failed to fetch offer delta",
    }),

  async respond(offerId, answer) {
    const data = await api<{ recipientState: RecipientState }>(`/api/offers/${offerId}/${answer}`, {
      method: "POST",
      timeoutMs: TIMEOUT_ACTION,
      failureMessage: `Failed to ${answer} offer`,
    });
    return data.recipientState;
  },
};
