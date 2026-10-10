import type { Offer, OfferDelta } from "@/types";
import { nullUnlessConnectionEnded } from "~/lib/errors";
import type { FindboligClient } from "~/lib/findbolig-client";
import { mapOfferToDomain } from "~/lib/findbolig-domain";
import { gone, walkOfferListing, type ListingCursor, type ListingView } from "~/offer-listing";

/** Offers the user can still answer: only Published ones belong in the offers view. */
function offersView(client: FindboligClient): ListingView<Offer> {
  return {
    belongs: (offer) => offer.state === "Published",
    async enrich(offer) {
      if (!offer.residenceId) return gone;
      const [residence, position] = await Promise.all([
        client.getResidence(offer.residenceId),
        client.getPositionOnOffer(offer.id).catch(nullUnlessConnectionEnded),
      ]);
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
export function getOfferUpdates(client: FindboligClient, cursor: ListingCursor): Promise<OfferDelta> {
  return walkOfferListing(client, cursor, offersView(client));
}
