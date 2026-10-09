import { localData } from "~/app/localData";
import { demoOffers } from "~/data/offers/demo";
import { httpOffers } from "~/data/offers/http";
import { offersKind } from "~/localData/offers";

export const useOffersStore = localData.define(offersKind({ live: httpOffers, demo: demoOffers() }));
