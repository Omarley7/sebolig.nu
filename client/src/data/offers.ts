import type { Offer } from "@/types";
import { useToastStore } from "~/stores/toast";
import { fetchActiveOffers } from "./offersSource";

const STORAGE_KEY = "offers_cache";

export function getOffersCacheAge(): number | null {
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

export function persistOffersCache(
  offers: Offer[],
  updatedAt: Date | null,
  latestUpdated: string | null,
  latestUpdatedIds: string[] = [],
) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ updatedAt, offers, latestUpdated, latestUpdatedIds }));
}

export async function getOffers(forceRefresh: boolean = false) {
  if (!forceRefresh) {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        return {
          updatedAt: new Date(parsed.updatedAt),
          offers: parsed.offers as Offer[],
          // Older caches predate the delta cursor — treat as absent rather than crash.
          latestUpdated: (parsed.latestUpdated as string | null | undefined) ?? null,
          latestUpdatedIds: (parsed.latestUpdatedIds as string[] | undefined) ?? [],
        };
      } catch {
        const toast = useToastStore();
        toast.warning("Failed to load cached data, fetching fresh data...");
      }
    }
  }

  const payload = await fetchActiveOffers();
  // A full fetch has no per-item id cursor (that's a `/delta`-only concept) — the next
  // delta call falls back to timestamp-only comparison until a delta response supplies one.
  const result = { ...payload, latestUpdatedIds: [] as string[] };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
  return result;
}

export function clearOffersCache() {
  localStorage.removeItem(STORAGE_KEY);
}
