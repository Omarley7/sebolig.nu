import type { Offer, RecipientState } from "@/types";
import { defineStore, storeToRefs } from "pinia";
import { ref, watch } from "vue";
import { useAuth } from "~/composables/useAuth";
import config from "~/config";
import { handleApiError } from "~/data/appointmentsSource";
import MOCK_OFFERS_JSON from "~/data/MOCK_OFFERS.json";
import { getOffers, isOffersCacheStale, persistOffersCache } from "~/data/offers";
import { acceptOffer as apiAcceptOffer, declineOffer as apiDeclineOffer } from "~/data/offersSource";
import { useI18n } from "~/i18n";
import { inDays } from "~/lib/dateHelper";
import { useToastStore } from "~/stores/toast";

const MOCK_DEADLINES = [inDays(1), inDays(5), inDays(10)];
function applyMockDeadlines(offers: Offer[]): Offer[] {
  return offers.map((offer, i) => ({ ...offer, deadline: MOCK_DEADLINES[i % MOCK_DEADLINES.length] }));
}

export const useOffersStore = defineStore("offers", () => {
  const offers = ref<Offer[]>([]);
  const updatedAt = ref<Date | null>(null);
  const isLoading = ref(false);
  const needsRefresh = ref(false);
  const sessionExpired = ref(false);
  const isActioning = ref(false);

  async function init() {
    const auth = useAuth();

    if (auth.isDemo) {
      isLoading.value = true;
      await new Promise((resolve) => setTimeout(resolve, 1000));
      offers.value = applyMockDeadlines(MOCK_OFFERS_JSON as Offer[]);
      updatedAt.value = new Date();
      isLoading.value = false;
      return;
    }

    isLoading.value = true;
    try {
      const cached = await getOffers(false);
      offers.value = cached.offers;
      updatedAt.value = cached.updatedAt;

      if (!auth.isAuthenticated) {
        sessionExpired.value = true;
        return;
      }

      // Stale either way; only an ended Connection (handled by the auth store) means there is nothing to refresh.
      if (isOffersCacheStale() && (await auth.checkConnection()) !== "ended") {
        needsRefresh.value = true;
      }
    } catch {
      if (!auth.isAuthenticated) return;
      try {
        const payload = await getOffers(true);
        offers.value = payload.offers;
        updatedAt.value = payload.updatedAt;
      } catch (error) {
        handleApiError(error, useToastStore(), useI18n().t, "Failed to load offers");
      }
    } finally {
      isLoading.value = false;
    }
  }

  async function refresh() {
    isLoading.value = true;
    needsRefresh.value = false;
    const auth = useAuth();

    if (auth.isDemo) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      offers.value = applyMockDeadlines(MOCK_OFFERS_JSON as Offer[]);
      updatedAt.value = new Date();
      isLoading.value = false;
      return;
    }

    try {
      const payload = await getOffers(true);
      offers.value = payload.offers;
      updatedAt.value = payload.updatedAt;
    } catch (error) {
      const check = await auth.recoverFrom(error);
      if (check === "live") {
        try {
          const payload = await getOffers(true);
          offers.value = payload.offers;
          updatedAt.value = payload.updatedAt;
          return;
        } catch {
          // retry also failed
        }
      } else if (check === "ended") {
        return; // the auth store erased Local data and sent the user home
      }
      handleApiError(error, useToastStore(), useI18n().t, "Failed to refresh offers");
    } finally {
      isLoading.value = false;
    }
  }

  async function acceptOffer(offerId: string): Promise<boolean> {
    const toast = useToastStore();
    const { t } = useI18n();
    const auth = useAuth();
    isActioning.value = true;
    try {
      if (auth.isDemo) {
        updateLocalOfferState(offerId, "OfferAccepted");
        toast.success(t("offers.acceptSuccess"));
        return true;
      }
      const newState = await apiAcceptOffer(offerId);
      updateLocalOfferState(offerId, newState);
      toast.success(t("offers.acceptSuccess"));
      return true;
    } catch (error) {
      handleApiError(error, toast, t, t("offers.actionFailed"));
      return false;
    } finally {
      isActioning.value = false;
    }
  }

  async function declineOffer(offerId: string): Promise<boolean> {
    const toast = useToastStore();
    const { t } = useI18n();
    const auth = useAuth();
    isActioning.value = true;
    try {
      if (auth.isDemo) {
        updateLocalOfferState(offerId, "OfferDeclined");
        toast.success(t("offers.declineSuccess"));
        return true;
      }
      const newState = await apiDeclineOffer(offerId);
      updateLocalOfferState(offerId, newState);
      toast.success(t("offers.declineSuccess"));
      return true;
    } catch (error) {
      handleApiError(error, toast, t, t("offers.actionFailed"));
      return false;
    } finally {
      isActioning.value = false;
    }
  }

  function updateLocalOfferState(offerId: string, newState: RecipientState) {
    const offer = offers.value.find((o) => o.id === offerId);
    if (offer) {
      offer.recipientState = newState;
      persistOffersCache(offers.value, updatedAt.value);
    }
  }

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
      sessionExpired.value = false;
      if (pendingRefresh) {
        pendingRefresh = false;
        refresh();
      }
    } else {
      offers.value = [];
      updatedAt.value = null;
      needsRefresh.value = false;
      sessionExpired.value = false;
    }
  });

  function getImageUrl(imagePath: string): string {
    return `${config.imageBaseUrl}${imagePath}`;
  }

  return {
    offers,
    updatedAt,
    isLoading,
    needsRefresh,
    sessionExpired,
    isActioning,
    init,
    refresh,
    handleRefresh,
    acceptOffer,
    declineOffer,
    getImageUrl,
  };
});
