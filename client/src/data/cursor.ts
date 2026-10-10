import type { Delta } from "@/types";

/**
 * Where a delta check picks up from: the newest `updated` value findbolig.nu reported (its own
 * clock, never a client Date), plus the ids already reported at exactly that value, so items
 * sharing one timestamp are told apart by id instead of by fetch order.
 */
export type Cursor = { latestUpdated: string; latestUpdatedIds: string[] };

/** What a full fetch hands out alongside its items: the cursor half of a delta (`latestUpdated` null when withheld). */
export type FullFetchCursor = Pick<Delta<unknown>, "latestUpdated" | "latestUpdatedIds">;
