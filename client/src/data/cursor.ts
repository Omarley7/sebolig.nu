import type { Delta, ThreadCursor } from "@/types";

/**
 * Where a delta check picks up from: the newest `updated` value findbolig.nu reported (its own
 * clock, never a client Date), plus the ids already reported at exactly that value, so items
 * sharing one timestamp are told apart by id instead of by fetch order. Appointments also keep
 * the thread cursor next to it (`latestMessageAt`, `latestMessageThreadIds`); see `ThreadCursor`.
 */
export type Cursor = {
  latestUpdated: string;
  latestUpdatedIds: string[];
  latestMessageAt?: string;
  latestMessageThreadIds?: string[];
};

/** A cursor with the thread cursor next to it, as an appointments delta needs. */
export type AppointmentsCursor = Required<Cursor>;

/**
 * What a fetch hands out alongside its items: the cursor half of a delta (`latestUpdated` null when
 * withheld), and the thread cursor for appointments.
 */
export type FullFetchCursor = Pick<Delta<unknown>, "latestUpdated" | "latestUpdatedIds"> & Partial<ThreadCursor>;

/** The cursor a fetch hands out, or null when it withheld it. A withheld thread cursor is left out. */
export function cursorFrom({ latestUpdated, latestUpdatedIds, latestMessageAt, latestMessageThreadIds }: FullFetchCursor): Cursor | null {
  if (!latestUpdated) return null;
  return latestMessageAt
    ? { latestUpdated, latestUpdatedIds, latestMessageAt, latestMessageThreadIds: latestMessageThreadIds ?? [] }
    : { latestUpdated, latestUpdatedIds };
}
