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
 * whenever there isn't a valid session — whether the user was never logged in or their
 * session just expired, both funnel into the same login modal — plus a login/logout
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
    const sessionValid = await auth.ensureSession();
    if (!sessionValid) {
      pendingRefresh = true;
      auth.showLoginModal = true;
      return;
    }
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
