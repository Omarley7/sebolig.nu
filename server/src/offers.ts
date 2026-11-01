import type { Offer, OfferDelta } from "@/types";
import { nullUnlessConnectionEnded } from "~/lib/errors";
import type { FindboligClient } from "~/lib/findbolig-client";
import { mapOfferToDomain, OPEN_OFFER_STATES } from "~/lib/findbolig-domain";
import { gone, walkOfferListing, type ListingCursor, type ListingView } from "~/offer-listing";

/** Offers the user can still answer: only open ones (see `OPEN_OFFER_STATES`) belong in the offers view. */
function offersView(client: FindboligClient): ListingView<Offer> {
  return {
    name: "offers",
    belongs: (offer) => OPEN_OFFER_STATES.includes(offer.state),
    async enrich(offer, { findbolig }) {
      const { residenceId } = offer;
      if (!residenceId) return gone;
      const [residence, position] = await findbolig(() =>
        Promise.all([
          client.getResidence(residenceId),
          client.getPositionOnOffer(offer.id).catch(nullUnlessConnectionEnded),
        ]),
      );
      return mapOfferToDomain({ offer, residence, position });
    },
  };
}

/** Every active offer with its residence and position, and the cursor for the next delta. */
export async function getActiveOffers(client: FindboligClient) {
  const { items, latestUpdated, latestUpdatedIds } = await walkOfferListing(client, null, offersView(client));
  return { offers: items, latestUpdated, latestUpdatedIds };
}

/** What changed in the offers view since `cursor`; only changed offers pay for enrichment. */
export async function getOfferUpdates(client: FindboligClient, cursor: ListingCursor): Promise<OfferDelta> {
  const { items, removedIds, removedStates, latestUpdated, latestUpdatedIds } = await walkOfferListing(client, cursor, offersView(client));
  return { items, removedIds, removedStates, latestUpdated, latestUpdatedIds };
}
