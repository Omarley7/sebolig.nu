/**
 * The Local data registry the app runs on, built from the concrete dependencies. Tests build
 * their own (see test/localDataHarness.ts) instead. Kinds are defined in stores/, and
 * app/wiring.ts makes sure every one of them is defined at startup.
 */
import { useAuth } from "~/composables/useAuth";
import { isTimeoutError } from "~/data/http";
import i18n from "~/i18n";
import { browserStorage, createLocalData, type Connection, type Mode, type Notice } from "~/lib/localData";
import { useToastStore } from "~/stores/toast";

function connection(): Connection {
  const auth = useAuth();
  return {
    isConnected: () => auth.isAuthenticated,
    recoverFrom: (error) => auth.recoverFrom(error),
    checkConnection: () => auth.checkConnection(),
    requestConnect: () => auth.requestConnect(),
  };
}

function notify({ level, key, params, cause }: Notice) {
  const toast = useToastStore();
  const { t } = i18n.global;
  if (level === "error" && isTimeoutError(cause)) return toast.warning(t("errors.timeout"), 8000);
  if (level === "warning") return toast.warning(t(key, params ?? {}), 8000);
  toast[level](t(key, params ?? {}));
}

function mode(): Mode {
  return useAuth().isDemo ? "demo" : "live";
}

export const localData = createLocalData({ storage: browserStorage, connection, notify, mode });
