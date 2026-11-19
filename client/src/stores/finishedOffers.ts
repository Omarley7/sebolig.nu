import { localData } from "~/app/localData";
import { finishedOffersStore } from "~/localData/finishedOffers";

export const useFinishedOffersStore = finishedOffersStore(localData.keep("finishedOffers"));
