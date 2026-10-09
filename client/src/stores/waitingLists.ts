import { localData } from "~/app/localData";
import { demoWaitingLists } from "~/data/waitingLists/demo";
import { httpWaitingLists } from "~/data/waitingLists/http";
import { waitingListsKind } from "~/localData/waitingLists";

export const useWaitingListsStore = localData.define(
  waitingListsKind({ live: httpWaitingLists, demo: demoWaitingLists() }),
);
