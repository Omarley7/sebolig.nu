import type { Delta } from "@/types";
import type { Cursor } from "./cursor";

/** The Demo's stand-in for findbolig.nu taking a while to answer. */
export const demoDelay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A cursor for the Demo's data, so later visits take the cheap check instead of refetching. */
export const demoCursor = (): Cursor => ({ latestUpdated: new Date().toISOString(), latestUpdatedIds: [] });

/** The Demo's answer to every delta check: nothing changed, keep the cursor. */
export const noChanges = <T>(): Delta<T> => ({ items: [], removedIds: [], latestUpdated: null, latestUpdatedIds: [] });
