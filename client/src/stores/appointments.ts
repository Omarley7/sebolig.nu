import type { Appointment } from "@/types";
import { defineStore, storeToRefs } from "pinia";
import { ref, watch } from "vue";
import { useAuth } from "~/composables/useAuth";
import config from "~/config";
import { getAppointments, isCacheStale } from "~/data/appointments";
import { applyMockAppointmentDates, handleApiError } from "~/data/appointmentsSource";
import mockAppointmentsJson from "~/data/MOCK_APPOINTMENTS.json";
import { useI18n } from "~/i18n";
import { useToastStore } from "~/stores/toast";

export const useAppointmentsStore = defineStore("appointments", () => {
  const appointments = ref<Appointment[]>([]);
  const updatedAt = ref<Date | null>(null);
  const isLoading = ref(false);
  const showAllOffers = ref(false);
  const needsRefresh = ref(false);
  const sessionExpired = ref(false);

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

      if (!auth.isAuthenticated) {
        sessionExpired.value = true;
        return;
      }

      // Stale either way; only an ended Connection (handled by the auth store) means there is nothing to refresh.
      if (isCacheStale() && (await auth.checkConnection()) !== "ended") {
        needsRefresh.value = true;
      }
    } catch {
      if (!auth.isAuthenticated) return;
      try {
        const payload = await getAppointments(true, showAllOffers.value);
        appointments.value = payload.appointments;
        updatedAt.value = payload.updatedAt;
      } catch (error) {
        handleApiError(error, useToastStore(), useI18n().t, "Failed to load appointments");
      }
    } finally {
      isLoading.value = false;
    }
  }

  async function refresh() {
    isLoading.value = true;
    needsRefresh.value = false;
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
    } catch (error) {
      const check = await auth.recoverFrom(error);
      if (check === "live") {
        try {
          const payload = await getAppointments(true, showAllOffers.value);
          appointments.value = payload.appointments;
          updatedAt.value = payload.updatedAt;
          return;
        } catch {
          // retry also failed
        }
      } else if (check === "ended") {
        return; // the auth store erased Local data and sent the user home
      }
      handleApiError(error, useToastStore(), useI18n().t, "Failed to refresh appointments");
    } finally {
      isLoading.value = false;
    }
  }

  function dismissRefresh() {
    needsRefresh.value = false;
  }

  let pendingRefresh = false;

  async function handleRefresh() {
    const auth = useAuth();
    if (!auth.isAuthenticated) {
      pendingRefresh = true;
      auth.showLoginModal = true;
      return;
    }
    // No pre-check: the server answers the data request itself with 401 (ended) or 504
    // (unreachable), and refresh() reacts to either through auth.recoverFrom.
    await refresh();
  }

  const { isAuthenticated } = storeToRefs(useAuth());
  watch(isAuthenticated, (loggedIn) => {
    if (loggedIn) {
      sessionExpired.value = false;
      if (pendingRefresh) {
        pendingRefresh = false;
        refresh();
      }
    } else {
      appointments.value = [];
      updatedAt.value = null;
      needsRefresh.value = false;
      sessionExpired.value = false;
    }
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
    needsRefresh,
    sessionExpired,
    init,
    refresh,
    dismissRefresh,
    handleRefresh,
    toggleShowAllOffers,
    getImageUrl,
  };
});
