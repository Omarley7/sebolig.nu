import { onMounted, onUnmounted } from "vue";

/** A Local data store whose init() runs the automatic check (see lib/localData). */
type Checkable = { init(): Promise<void> };

/**
 * Runs each store's automatic check when the page opens and again whenever the user comes back
 * to the tab. There is no timer; each store's own cooldown keeps quick tab switches cheap.
 */
export function useAutomaticChecks(...stores: Checkable[]) {
  const checkAll = () => {
    for (const store of stores) store.init();
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") checkAll();
  };

  onMounted(() => {
    checkAll();
    document.addEventListener("visibilitychange", onVisibilityChange);
  });
  onUnmounted(() => document.removeEventListener("visibilitychange", onVisibilityChange));
}
