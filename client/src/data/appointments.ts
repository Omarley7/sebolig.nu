import type { CachedAppointmentEntry } from "@/types";
import { deserializeAppointmentsPayload } from "~/lib/serialization";
import { useToastStore } from "~/stores/toast";
import { fetchAppointments, syncAppointments } from "./appointmentsSource";

const STORAGE_KEY = "appointments_cache";

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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  return payload;
}

export function clearAppointmentsCache() {
  localStorage.removeItem(STORAGE_KEY);
}
