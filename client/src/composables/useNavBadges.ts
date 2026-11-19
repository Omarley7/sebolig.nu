import { computed } from "vue";
import { useNow } from "~/composables/useNow";
import { unansweredOfferCount } from "~/lib/offerTabs";
import { useOffersStore } from "~/stores/offers";
import { useWaitingListsStore } from "~/stores/waitingLists";

/**
 * The nav badges (Q32): Tilbud counts open offers whose deadline hasn't passed, in red;
 * Ventelister counts the lists recently made passive, in neutral grey.
 */
export function useNavBadges() {
  const offers = useOffersStore();
  const waitingLists = useWaitingListsStore();
  const now = useNow();
  return computed<Record<string, { count: number; tone: "urgent" | "neutral" } | undefined>>(() => {
    const unanswered = unansweredOfferCount(offers.offers, now.value);
    const passive = waitingLists.recentlyPassivated.length;
    return {
      offers: unanswered > 0 ? { count: unanswered, tone: "urgent" } : undefined,
      "waiting-lists": passive > 0 ? { count: passive, tone: "neutral" } : undefined,
    };
  });
}
