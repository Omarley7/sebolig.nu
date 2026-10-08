import type { WaitingList, WaitingListSnapshot } from "@/types";
import { useToastStore } from "~/stores/toast";
import { fetchWaitingLists } from "./waitingListsSource";

const STORAGE_KEY = "waiting_lists_cache";
const SNAPSHOTS_KEY = "waiting_lists_snapshots";

export function getWaitingListsCacheAge(): number | null {
  const cached = localStorage.getItem(STORAGE_KEY);
  if (!cached) return null;
  try {
    const parsed = JSON.parse(cached);
    if (!parsed.updatedAt) return null;
    return Date.now() - new Date(parsed.updatedAt).getTime();
  } catch {
    return null;
  }
}

export function persistWaitingListsCache(lists: WaitingList[], updatedAt: Date | null) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ updatedAt, lists }));
}

export async function getWaitingLists(forceRefresh: boolean = false) {
  if (!forceRefresh) {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        return {
          updatedAt: new Date(parsed.updatedAt),
          lists: parsed.lists as WaitingList[],
        };
      } catch {
        const toast = useToastStore();
        toast.warning("Failed to load cached data, fetching fresh data...");
      }
    }
  }

  const payload = await fetchWaitingLists();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  return payload;
}

export function clearWaitingListsCache() {
  localStorage.removeItem(STORAGE_KEY);
}

// ── Snapshots (for status-flip detection) ──────────────────────────────

export function getSnapshots(): WaitingListSnapshot[] {
  const raw = localStorage.getItem(SNAPSHOTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as WaitingListSnapshot[];
  } catch {
    return [];
  }
}

export function persistSnapshots(snapshots: WaitingListSnapshot[]): void {
  localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(snapshots));
}

export function clearSnapshots(): void {
  localStorage.removeItem(SNAPSHOTS_KEY);
}

/**
 * Pure diff helper. Returns propertyIds that just flipped Active → Passive
 * compared to the previous snapshots. New lists (no prior snapshot) are not alerts.
 */
export function detectPassivated(
  lists: WaitingList[],
  prevSnapshots: WaitingListSnapshot[],
): string[] {
  const prevByProperty = new Map(prevSnapshots.map((s) => [s.propertyId, s]));
  const flipped: string[] = [];
  for (const list of lists) {
    if (list.status !== "Passive") continue;
    const prev = prevByProperty.get(list.propertyId);
    if (prev && prev.status === "Active") {
      flipped.push(list.propertyId);
    }
  }
  return flipped;
}

/** Builds fresh snapshots from current lists. */
export function buildSnapshots(lists: WaitingList[], observedAt: Date = new Date()): WaitingListSnapshot[] {
  const iso = observedAt.toISOString();
  return lists.map((l) => ({
    propertyId: l.propertyId,
    status: l.status,
    observedAt: iso,
  }));
}
