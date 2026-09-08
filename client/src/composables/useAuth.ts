import { defineStore } from "pinia";
import { ref } from "vue";
import { identify } from "~/composables/usePostHog";
import config from "~/config";
import { clearAppointmentsCache } from "~/data/appointments";
import { login as apiLogin, handleApiError, HttpError } from "~/data/appointmentsSource";
import { clearOffersCache } from "~/data/offers";
import { clearSnapshots, clearWaitingListsCache } from "~/data/waitingLists";
import { useI18n } from "~/i18n";
import router from "~/router";
import { useToastStore } from "~/stores/toast";

const TIMEOUT_REFRESH = 15_000;

export const useAuth = defineStore(
  "auth",
  () => {
    const email = ref("");
    const isLoading = ref(false);
    const isAuthenticated = ref(false);
    const isDemo = ref(false);
    const name = ref("");
    const showLoginModal = ref(false);
    let keepAliveTimer: number | null = null;
    const toast = useToastStore();

    async function login(userEmail: string, userPassword: string) {
      isLoading.value = true;

      try {
        const userData = await apiLogin(userEmail, userPassword);
        if (!userData) {
          toast.error("Login failed. Please try again.");
          return setAuthenticated(false);
        }

        email.value = userEmail;
        const ok = setAuthenticated(true, userData.fullName);
        if (ok) {
          startKeepAlive();
          toast.success(useI18n().t("auth.loginSuccess"));
          identify({ email: userEmail, name: userData.fullName });
        }
        return ok;
      } catch (err) {
        if (err instanceof HttpError && err.status === 401) {
          toast.error(useI18n().t("errors.invalidCredentials"), 6000);
        } else {
          handleApiError(err, toast, useI18n().t, "Login failed unexpectedly...", "errors.timeoutLogin");
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
      keepAliveTimer = window.setInterval(
        async () => {
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), TIMEOUT_REFRESH);
            const res = await fetch(`${config.backendDomain}/api/auth/refresh`, {
              method: "GET",
              credentials: "include",
              signal: controller.signal,
            });
            clearTimeout(timer);

            if (!res.ok) {
              if (res.status === 401) setAuthenticated(false);
              return;
            }

            const data = await res.json();
            if (data?.fullName) name.value = data.fullName;
          } catch (e) {
            console.error("Keep-alive failed:", e);
          }
        },
        3 * 60 * 1000,
      );
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

    async function logout() {
      try {
        await fetch(`${config.backendDomain}/api/auth/logout`, {
          method: "POST",
          credentials: "include",
        });
      } catch {
        // Best-effort — clear client state regardless
      }
      eraseLocalData();
      setAuthenticated(false);
      await router.push({ name: "home" });
    }

    async function validateSession(): Promise<boolean> {
      if (isDemo.value) return true;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_REFRESH);
        const res = await fetch(`${config.backendDomain}/api/auth/refresh`, {
          method: "GET",
          credentials: "include",
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!res.ok) {
          if (res.status === 401) setAuthenticated(false);
          return false;
        }

        const data = await res.json();
        if (data?.fullName) name.value = data.fullName;
        isAuthenticated.value = true;
        return true;
      } catch {
        return false;
      }
    }

    async function ensureSession(): Promise<boolean> {
      // Server handles auto-reauth — just validate the cookie
      const valid = await validateSession();
      if (!valid) setAuthenticated(false);
      return valid;
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

      await ensureSession();
    });

    return {
      email,
      isLoading,
      isAuthenticated,
      isDemo,
      name,
      showLoginModal,
      login,
      loginAsDemo,
      logout,
      startKeepAlive,
      stopKeepAlive,
      validateSession,
      ensureSession,
    };
  },
  {
    persist: {
      paths: ["email", "isAuthenticated", "name"],
    },
  },
);
