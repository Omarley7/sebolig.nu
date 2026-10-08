import { storeToRefs } from "pinia";
import { watch } from "vue";
import { useAuth } from "~/composables/useAuth";

export interface RefreshGateOptions {
  /** Performs the actual refresh; expected to manage its own isLoading state. */
  refresh: () => void | Promise<void>;
  /** Resets resource-specific state (data, cursors, snapshots, ...) on logout. */
  onLoggedOut: () => void;
}

/**
 * Shared "refresh gated behind auth" lifecycle used by every synced-resource store
 * (offers, appointments, waiting lists): a manual refresh trigger that prompts login
 * when there is no Connection — an ended Connection is handled by the auth store, which
 * erases Local data and shows the connect form — plus a login/logout
 * watcher that clears state or replays a refresh that was waiting on that prompt.
 */
export function useRefreshGate({ refresh, onLoggedOut }: RefreshGateOptions) {
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
      if (pendingRefresh) {
        pendingRefresh = false;
        refresh();
      }
    } else {
      onLoggedOut();
    }
  });

  return { handleRefresh };
}
