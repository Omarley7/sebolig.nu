import { readonly, ref } from "vue";

/** From `lg` up the app has a left nav rail and two-pane lists (Q14). */
const query = typeof window !== "undefined" ? window.matchMedia?.("(min-width: 1024px)") : undefined;
const isDesktop = ref(query?.matches ?? false);
query?.addEventListener?.("change", (e) => (isDesktop.value = e.matches));

export function useIsDesktop() {
  return readonly(isDesktop);
}
