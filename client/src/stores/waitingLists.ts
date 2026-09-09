import type { WaitingList } from "@/types";
import { defineStore, storeToRefs } from "pinia";
import { ref, watch } from "vue";
import { useAuth } from "~/composables/useAuth";
import config from "~/config";
import { handleApiError } from "~/data/appointmentsSource";
import {
  buildSnapshots,
  detectPassivated,
  getSnapshots,
  getWaitingLists,
  isWaitingListsCacheStale,
  persistSnapshots,
  persistWaitingListsCache,
} from "~/data/waitingLists";
import {
  setWaitingListActive as apiSetActive,
  unsubscribeFromWaitingList as apiUnsubscribe,
} from "~/data/waitingListsSource";
import { useI18n } from "~/i18n";
import { useToastStore } from "~/stores/toast";

const CONCURRENCY_REACTIVATE_ALL = 5;

export const useWaitingListsStore = defineStore("waitingLists", () => {
  const lists = ref<WaitingList[]>([]);
  const updatedAt = ref<Date | null>(null);
  const isLoading = ref(false);
  const isMutating = ref(false);
  const needsRefresh = ref(false);
  const sessionExpired = ref(false);
  const recentlyPassivated = ref<string[]>([]);

  // For "Reactivating X of N" counter
  const bulkInProgress = ref(false);
  const bulkDone = ref(0);
  const bulkTotal = ref(0);

  async function init() {
    const auth = useAuth();

    isLoading.value = true;
    try {
      // Cache-first (same path for demo and real — config.useMockData inside fetchWaitingLists handles the demo case)
      const cached = await getWaitingLists(false);
      lists.value = cached.lists;
      updatedAt.value = cached.updatedAt;

      // Demo: seed the banner once on first ever mount so the demo user can see the alert UI.
      if (auth.isDemo && getSnapshots().length === 0) {
        recentlyPassivated.value = cached.lists
          .filter((l) => l.status === "Passive")
          .map((l) => l.propertyId);
        persistSnapshots(buildSnapshots(cached.lists));
      }

      if (!auth.isDemo && !auth.isAuthenticated) {
        sessionExpired.value = true;
        return;
      }

      // Stale either way; only an ended Connection (handled by the auth store) means there is nothing to refresh.
      if (!auth.isDemo && isWaitingListsCacheStale() && (await auth.checkConnection()) !== "ended") {
        needsRefresh.value = true;
      }
    } catch {
      if (!auth.isDemo && !auth.isAuthenticated) return;
      try {
        const payload = await getWaitingLists(true);
        lists.value = payload.lists;
        updatedAt.value = payload.updatedAt;
        runDiff(payload.lists);
      } catch (error) {
        handleApiError(error, useToastStore(), useI18n().t, "Failed to load waiting lists");
      }
    } finally {
      isLoading.value = false;
    }
  }

  async function refresh() {
    if (isLoading.value) return;
    isLoading.value = true;
    needsRefresh.value = false;
    const auth = useAuth();

    if (auth.isDemo) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      // Demo refresh keeps current lists but bumps timestamp so the page header updates.
      updatedAt.value = new Date();
      isLoading.value = false;
      return;
    }

    try {
      const payload = await getWaitingLists(true);
      runDiff(payload.lists);
      lists.value = payload.lists;
      updatedAt.value = payload.updatedAt;
    } catch (error) {
      const check = await auth.recoverFrom(error);
      if (check === "live") {
        try {
          const payload = await getWaitingLists(true);
          runDiff(payload.lists);
          lists.value = payload.lists;
          updatedAt.value = payload.updatedAt;
          return;
        } catch {
          // retry also failed
        }
      } else if (check === "ended") {
        return; // the auth store erased Local data and sent the user home
      }
      handleApiError(error, useToastStore(), useI18n().t, "Failed to refresh waiting lists");
    } finally {
      isLoading.value = false;
    }
  }

  function runDiff(newLists: WaitingList[]) {
    // detectPassivated handles empty prev snapshots correctly (returns []) — no first-load false alerts.
    const prev = getSnapshots();
    recentlyPassivated.value = detectPassivated(newLists, prev);
    persistSnapshots(buildSnapshots(newLists));
  }

  async function setActive(propertyId: string): Promise<boolean> {
    const toast = useToastStore();
    const { t } = useI18n();
    const auth = useAuth();
    const list = lists.value.find((l) => l.propertyId === propertyId);
    if (!list) return false;
    const originalStatus = list.status;

    isMutating.value = true;
    // Optimistic flip + cache write
    list.status = "Active";
    persistWaitingListsCache(lists.value, updatedAt.value);

    try {
      if (!auth.isDemo) await apiSetActive(propertyId);
      // Persist snapshot so we don't re-alert on next refresh
      persistSnapshots(buildSnapshots(lists.value));
      toast.success(t("waitingLists.actions.reactivateSuccess", { name: list.name }));
      return true;
    } catch (error) {
      // Revert
      list.status = originalStatus;
      persistWaitingListsCache(lists.value, updatedAt.value);
      handleApiError(error, toast, t, t("waitingLists.actions.reactivateFailed", { name: list.name }));
      return false;
    } finally {
      // Per spec: remove from banner whether success or failure — the user has acknowledged it.
      recentlyPassivated.value = recentlyPassivated.value.filter((id) => id !== propertyId);
      isMutating.value = false;
    }
  }

  async function reactivateAll(): Promise<void> {
    const toast = useToastStore();
    const { t } = useI18n();
    const auth = useAuth();
    const passive = lists.value.filter((l) => l.status === "Passive");
    if (passive.length === 0) return;

    bulkInProgress.value = true;
    bulkDone.value = 0;
    bulkTotal.value = passive.length;
    isMutating.value = true;

    let cursor = 0;
    const failed: WaitingList[] = [];
    let connectionRefusedDuringBulk = false;

    async function worker() {
      while (true) {
        // Short-circuit once the Connection was refused — don't keep firing failing requests.
        if (connectionRefusedDuringBulk) return;
        const i = cursor++;
        if (i >= passive.length) return;
        const list = passive[i];
        try {
          if (!auth.isDemo) await apiSetActive(list.propertyId);
          list.status = "Active";
          // Persist after each successful flip so partial progress survives a tab close.
          persistWaitingListsCache(lists.value, updatedAt.value);
          recentlyPassivated.value = recentlyPassivated.value.filter((id) => id !== list.propertyId);
        } catch (error) {
          if (auth.isUnauthenticated(error)) {
            connectionRefusedDuringBulk = true;
            failed.push(list);
            return;
          }
          failed.push(list);
        } finally {
          bulkDone.value++;
        }
      }
    }

    const workers = Array.from(
      { length: Math.min(CONCURRENCY_REACTIVATE_ALL, passive.length) },
      () => worker(),
    );
    await Promise.all(workers);

    persistWaitingListsCache(lists.value, updatedAt.value);
    persistSnapshots(buildSnapshots(lists.value));

    bulkInProgress.value = false;
    isMutating.value = false;

    if (connectionRefusedDuringBulk) {
      // Ended: the auth store erased Local data and sent the user home. Live or unreachable:
      // let the user retry from the summary below; we don't auto-retry to avoid surprise side effects.
      if ((await auth.checkConnection()) === "ended") return;
    }

    const succeeded = passive.length - failed.length;
    if (failed.length === 0) {
      toast.success(t("waitingLists.actions.reactivateAllSuccess", { count: succeeded }));
    } else {
      toast.warning(
        t("waitingLists.actions.reactivateAllPartial", {
          done: succeeded,
          total: passive.length,
          failed: failed.length,
        }),
        8000,
      );
    }
  }

  async function unsubscribe(propertyId: string): Promise<boolean> {
    const toast = useToastStore();
    const { t } = useI18n();
    const auth = useAuth();
    const list = lists.value.find((l) => l.propertyId === propertyId);
    if (!list) return false;

    isMutating.value = true;
    try {
      if (!auth.isDemo) await apiUnsubscribe(propertyId);
      lists.value = lists.value.filter((l) => l.propertyId !== propertyId);
      persistWaitingListsCache(lists.value, updatedAt.value);
      // Drop its snapshot so re-applying later is treated as baseline, not a transition
      const snapshots = getSnapshots().filter((s) => s.propertyId !== propertyId);
      persistSnapshots(snapshots);
      recentlyPassivated.value = recentlyPassivated.value.filter((id) => id !== propertyId);
      toast.success(t("waitingLists.actions.unsubscribeSuccess", { name: list.name }));
      return true;
    } catch (error) {
      handleApiError(error, toast, t, t("waitingLists.actions.unsubscribeFailed", { name: list.name }));
      return false;
    } finally {
      isMutating.value = false;
    }
  }

  function dismissPassivatedBanner() {
    recentlyPassivated.value = [];
  }

  function getImageUrl(imagePath: string | null | undefined): string {
    if (!imagePath) return "";
    return `${config.imageBaseUrl}${imagePath}`;
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
      lists.value = [];
      updatedAt.value = null;
      needsRefresh.value = false;
      sessionExpired.value = false;
      recentlyPassivated.value = [];
    }
  });

  return {
    lists,
    updatedAt,
    isLoading,
    isMutating,
    needsRefresh,
    sessionExpired,
    recentlyPassivated,
    bulkInProgress,
    bulkDone,
    bulkTotal,
    init,
    refresh,
    handleRefresh,
    setActive,
    reactivateAll,
    unsubscribe,
    dismissPassivatedBanner,
    getImageUrl,
  };
});
