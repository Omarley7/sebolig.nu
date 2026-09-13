import { storeToRefs } from "pinia";
import type { Ref } from "vue";
import { watch } from "vue";
import { useAuth } from "~/composables/useAuth";

export interface RefreshGateOptions {
  needsRefresh: Ref<boolean>;
  sessionExpired: Ref<boolean>;
  /** Performs the actual refresh; expected to manage its own isLoading state. */
  refresh: () => void | Promise<void>;
  /** Resets resource-specific state (data, cursors, snapshots, ...) on logout. */
  onLoggedOut: () => void;
}

/**
 * Shared "refresh gated behind auth" lifecycle used by every synced-resource store
 * (offers, appointments, waiting lists): a manual refresh trigger that prompts login
 * when needed, plus a login/logout watcher that clears state or replays a refresh
 * that was waiting on a login prompt.
 */
export function useRefreshGate({ needsRefresh, sessionExpired, refresh, onLoggedOut }: RefreshGateOptions) {
  let pendingRefresh = false;

  function dismissRefresh() {
    needsRefresh.value = false;
  }

  async function handleRefresh() {
    const auth = useAuth();
    if (!auth.isAuthenticated) {
      pendingRefresh = true;
      auth.showLoginModal = true;
      return;
    }
    const sessionValid = await auth.ensureSession();
    if (!sessionValid) {
      sessionExpired.value = true;
      needsRefresh.value = false;
      return;
    }
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
      onLoggedOut();
      needsRefresh.value = false;
      sessionExpired.value = false;
    }
  });

  return { dismissRefresh, handleRefresh };
}
