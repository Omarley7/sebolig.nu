import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { updatedAgo } from "~/lib/relativeTime";
import { useNow } from "./useNow";

/** What a list page needs of its Local data store to show loading, errors and "Opdateret …". */
type ListStore = {
  hasData: boolean;
  isLoading: boolean;
  isBusy: boolean;
  status: "idle" | "loading" | "error";
  checkedAt: Date | null;
  updatedAt: Date | null;
};

/**
 * A list page's state (Q30): placeholder rows on a first load with nothing stored; a full-screen
 * error when a fetch failed with nothing stored; otherwise the list, with a slim error banner over
 * it when the latest refresh failed. The subtitle says when it was last updated.
 */
export function useListStatus(store: ListStore) {
  const { t } = useI18n();
  const now = useNow();
  return computed(() => {
    const lastChecked = store.checkedAt ?? store.updatedAt;
    let subtitle: string;
    if (!store.hasData) subtitle = store.isLoading ? t("common.fetching") : t("common.notFetchedYet");
    else if (lastChecked) subtitle = t("common.lastUpdated", { ago: updatedAgo(lastChecked, now.value, t) });
    else subtitle = "";
    return {
      skeleton: !store.hasData && store.status !== "error",
      fullError: !store.hasData && store.status === "error",
      banner: store.hasData && store.status === "error",
      subtitle,
    };
  });
}
