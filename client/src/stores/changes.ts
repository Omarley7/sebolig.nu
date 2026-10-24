import { localData } from "~/app/localData";
import { changesStore } from "~/localData/changes";

export const useChangesStore = changesStore(localData.keep("changes"));
