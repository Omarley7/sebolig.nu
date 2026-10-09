import type { Delta } from "@/types";
import type { Cursor } from "~/data/cursor";

/**
 * Local data kept in step with findbolig.nu's offers listing through a delta cursor: offers
 * and appointments. `cursor` is null until a fetch has handed one out (or for data stored
 * before cursors existed).
 */
export type CursorData<T> = { updatedAt: Date; items: T[]; cursor: Cursor | null };

/** A source that can say what changed since a cursor it handed out earlier. */
export interface DeltaSource<T> {
  fetchDelta(cursor: Cursor): Promise<Delta<T>>;
}

/**
 * Merges a delta into cursor data: upserts changed items by key, drops removed ones. A delta
 * without a cursor (the server withholds it when some enrichment failed) keeps the old one,
 * so the same changes are asked for again next time.
 */
export function applyDelta<T>(data: CursorData<T>, delta: Delta<T>, keyOf: (item: T) => string): CursorData<T> {
  const cursor = delta.latestUpdated
    ? { latestUpdated: delta.latestUpdated, latestUpdatedIds: delta.latestUpdatedIds }
    : data.cursor;
  if (delta.items.length === 0 && delta.removedIds.length === 0) return { ...data, cursor };

  const removed = new Set(delta.removedIds);
  const byKey = new Map(data.items.filter((item) => !removed.has(keyOf(item))).map((item) => [keyOf(item), item]));
  for (const item of delta.items) byKey.set(keyOf(item), item);
  return { updatedAt: new Date(), items: Array.from(byKey.values()), cursor };
}

/**
 * How cursor data is stored on the device: flat, under the field names the stores used
 * before the Local data module (offers_cache keeps `offers`, appointments_cache keeps
 * `appointments`), so nothing already stored is lost.
 */
type Stored<ItemsKey extends string, T> = {
  updatedAt: string;
  latestUpdated?: string | null;
  latestUpdatedIds?: string[];
} & Record<ItemsKey, T[]>;

/**
 * The shared half of a cursor kind's definition: storing, the full fetch and the cheap
 * delta check. The kind supplies how items are keyed and how a full fetch is made.
 */
export function cursorKind<T, ItemsKey extends string, Source extends DeltaSource<T>>(kind: {
  /** The field the items are stored under. */
  itemsKey: ItemsKey;
  keyOf(item: T): string;
  /** Fills in fields that older stored items predate. */
  reviveItem?(stored: T): T;
  fetchEverything(current: CursorData<T> | null, source: Source): Promise<{ items: T[]; latestUpdated: string | null }>;
}) {
  return {
    revive(raw: unknown): CursorData<T> {
      const stored = raw as Stored<ItemsKey, T>;
      const items = stored[kind.itemsKey] ?? [];
      return {
        updatedAt: new Date(stored.updatedAt),
        items: kind.reviveItem ? items.map(kind.reviveItem) : items,
        // Older stored data predates the delta cursor: treat it as absent.
        cursor: stored.latestUpdated
          ? { latestUpdated: stored.latestUpdated, latestUpdatedIds: stored.latestUpdatedIds ?? [] }
          : null,
      };
    },

    serialize(data: CursorData<T>): Stored<ItemsKey, T> {
      return {
        updatedAt: data.updatedAt.toISOString(),
        latestUpdated: data.cursor?.latestUpdated ?? null,
        latestUpdatedIds: data.cursor?.latestUpdatedIds ?? [],
        [kind.itemsKey]: data.items,
      } as Stored<ItemsKey, T>;
    },

    async fetchAll(current: CursorData<T> | null, source: Source): Promise<CursorData<T>> {
      const { items, latestUpdated } = await kind.fetchEverything(current, source);
      // A full fetch has no per-item id cursor; the next delta compares by timestamp only.
      return { updatedAt: new Date(), items, cursor: latestUpdated ? { latestUpdated, latestUpdatedIds: [] } : null };
    },

    async checkForChanges(current: CursorData<T>, source: Source): Promise<CursorData<T> | null> {
      if (!current.cursor) return null;
      return applyDelta(current, await source.fetchDelta(current.cursor), kind.keyOf);
    },
  };
}
