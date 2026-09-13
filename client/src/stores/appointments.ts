import type { Appointment, AppointmentDelta } from "@/types";
import { defineStore } from "pinia";
import { ref } from "vue";
import { useAuth } from "~/composables/useAuth";
import { useRefreshGate } from "~/composables/useRefreshGate";
import config from "~/config";
import { getAppointments } from "~/data/appointments";
import { applyMockAppointmentDates, fetchAppointmentDelta, handleApiError, HttpError } from "~/data/appointmentsSource";
import mockAppointmentsJson from "~/data/MOCK_APPOINTMENTS.json";
import { useI18n } from "~/i18n";
import { useToastStore } from "~/stores/toast";

export const useAppointmentsStore = defineStore("appointments", () => {
  const appointments = ref<Appointment[]>([]);
  const updatedAt = ref<Date | null>(null);
  // Cursor for the delta check — see offers store / getAppointmentUpdates for why this must
  // always come from the server (findbolig.nu's own `updated` clock), never a client Date.
  const latestUpdated = ref<string | null>(null);
  const isLoading = ref(false);
  const showAllOffers = ref(false);

  async function init() {
    const auth = useAuth();

    if (auth.isDemo) {
      isLoading.value = true;
      await new Promise((resolve) => setTimeout(resolve, 1500));
      appointments.value = applyMockAppointmentDates(mockAppointmentsJson as Appointment[]);
      updatedAt.value = new Date();
      isLoading.value = false;
      return;
    }

    isLoading.value = true;
    try {
      const cached = await getAppointments(false, showAllOffers.value);
      appointments.value = cached.appointments;
      updatedAt.value = cached.updatedAt;
      latestUpdated.value = cached.latestUpdated;

      if (!auth.isAuthenticated) return;

      if (latestUpdated.value) {
        // We have a cursor from a previous fetch — ask "did anything actually change"
        // instead of blindly refetching on a fixed clock.
        await checkForUpdates();
      } else if (await auth.ensureSession()) {
        // No cursor yet — a cache from before the delta cursor existed. Self-heal with one
        // full refresh (which seeds latestUpdated) instead of leaving the user stuck until
        // they notice and click a manual refresh. If the session isn't valid, just leave the
        // cached data as-is — the header refresh button prompts login when they want fresh data.
        await refresh();
      }
    } catch {
      if (!auth.isAuthenticated) return;
      try {
        const payload = await getAppointments(true, showAllOffers.value);
        appointments.value = payload.appointments;
        updatedAt.value = payload.updatedAt;
        latestUpdated.value = payload.latestUpdated;
      } catch (error) {
        handleApiError(error, useToastStore(), useI18n().t, "Failed to load appointments");
      }
    } finally {
      isLoading.value = false;
    }
  }

  /** Merges a delta response into the local list: upserts changed appointments, drops ones that left view. */
  function applyDelta(delta: AppointmentDelta) {
    if (delta.latestUpdated) latestUpdated.value = delta.latestUpdated;

    if (delta.items.length === 0 && delta.removedIds.length === 0) {
      return;
    }

    const removed = new Set(delta.removedIds);
    const byOfferId = new Map(
      appointments.value.filter((a) => !removed.has(a.offerId)).map((a) => [a.offerId, a]),
    );
    for (const appointment of delta.items) {
      byOfferId.set(appointment.offerId, appointment);
    }

    appointments.value = Array.from(byOfferId.values());
    updatedAt.value = new Date();
  }

  /** Lightweight check, meant to run on every navigation to the appointments view: asks the
   * server whether anything changed since our cursor, and only re-derives what did. */
  async function checkForUpdates() {
    const cursor = latestUpdated.value;
    if (!cursor) return;
    try {
      applyDelta(await fetchAppointmentDelta(cursor, showAllOffers.value));
    } catch {
      // Best-effort — keep showing cached data if the check itself fails.
    }
  }

  async function refresh() {
    isLoading.value = true;
    const auth = useAuth();

    if (auth.isDemo) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      appointments.value = applyMockAppointmentDates(mockAppointmentsJson as Appointment[]);
      updatedAt.value = new Date();
      isLoading.value = false;
      return;
    }

    try {
      const payload = await getAppointments(true, showAllOffers.value);
      appointments.value = payload.appointments;
      updatedAt.value = payload.updatedAt;
      latestUpdated.value = payload.latestUpdated;
    } catch (error) {
      const is401 = error instanceof HttpError && error.status === 401;
      if (is401) {
        const recovered = await auth.ensureSession();
        if (recovered) {
          try {
            const payload = await getAppointments(true, showAllOffers.value);
            appointments.value = payload.appointments;
            updatedAt.value = payload.updatedAt;
            latestUpdated.value = payload.latestUpdated;
            return;
          } catch {
            // retry also failed
          }
        } else {
          // Session is confirmed dead — prompt login directly instead of a separate
          // "session expired" state the user would otherwise have no way to see.
          auth.showLoginModal = true;
          return;
        }
      }
      handleApiError(error, useToastStore(), useI18n().t, "Failed to refresh appointments");
    } finally {
      isLoading.value = false;
    }
  }

  const { handleRefresh } = useRefreshGate({
    refresh,
    onLoggedOut: () => {
      appointments.value = [];
      updatedAt.value = null;
      latestUpdated.value = null;
    },
  });

  function toggleShowAllOffers() {
    showAllOffers.value = !showAllOffers.value;
  }

  function getImageUrl(imagePath: string): string {
    return `${config.imageBaseUrl}${imagePath}`;
  }

  return {
    appointments,
    updatedAt,
    isLoading,
    showAllOffers,
    init,
    refresh,
    handleRefresh,
    toggleShowAllOffers,
    getImageUrl,
  };
});
