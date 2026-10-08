import type { ConnectionEndedReason } from "@/types";
import { defineStore } from "pinia";
import { ref } from "vue";
import { identify } from "~/composables/usePostHog";
import config from "~/config";
import { clearAppointmentsCache } from "~/data/appointments";
import { login as apiLogin, handleApiError, HttpError, readEndedReason } from "~/data/appointmentsSource";
import { clearOffersCache } from "~/data/offers";
import { clearSnapshots, clearWaitingListsCache } from "~/data/waitingLists";
import { useI18n } from "~/i18n";
import router from "~/router";
import { useToastStore } from "~/stores/toast";

const TIMEOUT_REFRESH = 15_000;
const KEEP_ALIVE_INTERVAL = 3 * 60 * 1000;

/**
 * What a Connection check found out.
 * - live: the server still has a usable Connection
 * - ended: the server said the Connection is over; Local data has been erased and the user sent home
 * - unreachable: findbolig.nu did not answer (timeout, network, 504); the Connection is kept
 */
export type ConnectionCheck = "live" | "ended" | "unreachable";

export const useAuth = defineStore(
  "auth",
  () => {
    const email = ref("");
    const isLoading = ref(false);
    const isAuthenticated = ref(false);
    const isDemo = ref(false);
    const name = ref("");
    const showLoginModal = ref(false);
    /**
     * Set when the server ended the Connection because findbolig.nu rejected the stored
     * password. Deliberately not persisted: a page load clears it, as does the next connect.
     */
    const endedByPasswordChange = ref(false);
    let keepAliveTimer: number | null = null;
    const toast = useToastStore();

    async function login(userEmail: string, userPassword: string) {
      isLoading.value = true;

      const { t } = useI18n();
      try {
        const userData = await apiLogin(userEmail, userPassword);
        if (!userData) {
          toast.error(t("errors.connectFailed"));
          return setAuthenticated(false);
        }

        email.value = userEmail;
        const ok = setAuthenticated(true, userData.fullName);
        if (ok) {
          endedByPasswordChange.value = false;
          startKeepAlive();
          toast.success(t("auth.connected"));
          identify();
        }
        return ok;
      } catch (err) {
        if (err instanceof HttpError && err.status === 401) {
          toast.error(t("errors.invalidCredentials"), 6000);
        } else {
          handleApiError(err, toast, t, t("errors.connectFailed"), "errors.timeoutConnect");
        }
        return setAuthenticated(false);
      } finally {
        isLoading.value = false;
      }
    }

    function setAuthenticated(value: boolean, newName?: string) {
      isAuthenticated.value = value;
      if (newName !== undefined) name.value = newName;
      if (!value) {
        isDemo.value = false;
        stopKeepAlive();
      }
      return value;
    }

    function loginAsDemo(demoName: string) {
      isDemo.value = true;
      name.value = demoName;
      email.value = `${demoName.toLowerCase().replace(/\s+/g, "")}@example.com`;
      isAuthenticated.value = true;
      showLoginModal.value = false;
      toast.success(useI18n().t("auth.demoLoginSuccess"));
      identify({ name: demoName });
    }

    function startKeepAlive() {
      stopKeepAlive();
      keepAliveTimer = window.setInterval(() => void checkConnection(), KEEP_ALIVE_INTERVAL);
    }

    function stopKeepAlive() {
      if (keepAliveTimer) {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
      }
    }

    /**
     * The one definition of what Local data is: the data caches plus the persisted identity.
     * Persisted preferences (locale, theme) are not Local data and survive.
     *
     * The identity is this store's own persisted state, so blanking it here is what ends up
     * on the device; removing the storage key would be undone by the next state write.
     */
    function eraseLocalData() {
      clearAppointmentsCache();
      clearOffersCache();
      clearWaitingListsCache();
      clearSnapshots();
      email.value = "";
      name.value = "";
      isAuthenticated.value = false;
    }

    /**
     * The one place a Connection ends on this device, whether the user disconnected or
     * the server said it was over: erase Local data, reset auth state, remember why, go home.
     * Only `credentials_rejected` is worth explaining to the user; any other ending is silent.
     */
    async function endConnection(reason?: ConnectionEndedReason) {
      eraseLocalData();
      setAuthenticated(false);
      endedByPasswordChange.value = reason === "credentials_rejected";
      await router.push({ name: "home" });
    }

    async function logout() {
      try {
        await fetch(`${config.backendDomain}/api/auth/logout`, {
          method: "POST",
          credentials: "include",
        });
      } catch {
        // Best-effort — clear client state regardless
      }
      await endConnection();
    }

    /**
     * Asks the server whether the Connection is still live and reacts to the answer.
     * The keep-alive poll, the visibility check and the data stores all come through here,
     * so the outcome does not depend on which request happened to notice.
     */
    async function checkConnection(): Promise<ConnectionCheck> {
      if (isDemo.value) return "live";
      let res: Response;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_REFRESH);
        res = await fetch(`${config.backendDomain}/api/auth/refresh`, {
          method: "GET",
          credentials: "include",
          signal: controller.signal,
        });
        clearTimeout(timer);
      } catch {
        return "unreachable";
      }

      if (res.status === 401) {
        await endConnection(await readEndedReason(res));
        return "ended";
      }
      if (!res.ok) return "unreachable";

      const data = await res.json().catch(() => null);
      if (data?.fullName) name.value = data.fullName;
      isAuthenticated.value = true;
      return "live";
    }

    /** Whether a failed data request was refused because the server could not use the Connection. */
    function isUnauthenticated(error: unknown): boolean {
      return error instanceof HttpError && error.status === 401;
    }

    /**
     * Data stores hand a failed request here instead of reading status codes themselves.
     * A refused request that says why is the server's final word (it has already cleared the
     * cookie, so a second look could only answer a reasonless 401): the Connection ends with that
     * reason. A refused request without a reason gets the Connection re-checked. Any other
     * failure is not the Connection's business.
     */
    async function recoverFrom(error: unknown): Promise<ConnectionCheck | "unrelated"> {
      if (!(error instanceof HttpError && error.status === 401)) return "unrelated";
      if (error.reason) {
        await endConnection(error.reason);
        return "ended";
      }
      return checkConnection();
    }

    // Resume keep-alive if already authenticated on startup (skip in demo mode)
    if (isAuthenticated.value && !isDemo.value) startKeepAlive();

    // Validate session when tab regains focus
    let lastVisibilityCheck = 0;
    const VISIBILITY_COOLDOWN = 30_000;

    document.addEventListener("visibilitychange", async () => {
      if (document.visibilityState !== "visible") return;
      if (!isAuthenticated.value || isDemo.value) return;

      const now = Date.now();
      if (now - lastVisibilityCheck < VISIBILITY_COOLDOWN) return;
      lastVisibilityCheck = now;

      await checkConnection();
    });

    return {
      email,
      isLoading,
      isAuthenticated,
      isDemo,
      name,
      showLoginModal,
      endedByPasswordChange,
      login,
      loginAsDemo,
      logout,
      startKeepAlive,
      stopKeepAlive,
      checkConnection,
      isUnauthenticated,
      recoverFrom,
    };
  },
  {
    persist: {
      paths: ["email", "isAuthenticated", "name"],
    },
  },
);
