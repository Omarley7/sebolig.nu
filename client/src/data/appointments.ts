import type { Appointment, CachedAppointmentEntry } from "@/types";
import { deserializeAppointmentsPayload } from "~/lib/serialization";
import { useToastStore } from "~/stores/toast";
import { fetchAppointments, syncAppointments } from "./appointmentsSource";

const STORAGE_KEY = "appointments_cache";

/**
 * Persists a merged appointments snapshot (full fetch or delta merge) into the cache, so a
 * reload picks up the merge result and cursor instead of re-running the same delta and, in
 * the meantime, showing stale data — see the appointments store's `applyDelta`.
 */
export function persistAppointmentsCache(
  appointments: Appointment[],
  updatedAt: Date | null,
  latestUpdated: string | null,
  latestUpdatedIds: string[] = [],
) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ updatedAt, appointments, latestUpdated, latestUpdatedIds }));
}

export function getCacheAge(): number | null {
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

function buildCacheEntries(): CachedAppointmentEntry[] {
  const cached = localStorage.getItem(STORAGE_KEY);
  if (!cached) return [];
  try {
    const parsed = JSON.parse(cached);
    const appointments = parsed.appointments ?? [];
    return appointments.map((appt: any) => ({
      offerId: appt.offerId ?? appt.id?.replace(/^DEAS-O-/, "") ?? "",
      messageCount: appt.messageCount ?? 0,
      date: appt.date ?? null,
      appointment: appt,
    }));
  } catch {
    return [];
  }
}

export async function getAppointments(forceRefresh: boolean = false, includeAll: boolean = false) {
  if (!forceRefresh) {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        return deserializeAppointmentsPayload(parsed);
      } catch (error) {
        const toast = useToastStore();
        toast.warning("Failed to load cached data, fetching fresh data...");
      }
    }
  }

  const cacheEntries = buildCacheEntries();
  const payload = cacheEntries.length > 0
    ? await syncAppointments(cacheEntries, includeAll)
    : await fetchAppointments(includeAll);
  // A full fetch/sync has no per-item id cursor (that's a `/delta`-only concept) — the next
  // delta call falls back to timestamp-only comparison until a delta response supplies one.
  const result = { ...payload, latestUpdatedIds: [] as string[] };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
  return result;
}

export function clearAppointmentsCache() {
  localStorage.removeItem(STORAGE_KEY);
}
