import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";

/**
 * A page's tab, kept in the address as `?tab=` (Q26), so back, reload and shared links show the
 * same tab. Switching replaces the address rather than adding a back step, and lets go of the
 * open item (`?open=`), which belongs to the tab left.
 */
export function useQueryTab<T extends string>(tabs: readonly T[], first: T) {
  const route = useRoute();
  const router = useRouter();
  return computed<T>({
    get() {
      const tab = route.query.tab;
      return typeof tab === "string" && (tabs as readonly string[]).includes(tab) ? (tab as T) : first;
    },
    set(tab) {
      const { open: _, ...query } = route.query;
      void router.replace({ query: { ...query, tab } });
    },
  });
}
