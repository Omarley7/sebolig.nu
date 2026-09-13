import type { Offer, OfferDelta, RecipientState } from "@/types";
import { defineStore } from "pinia";
import { ref } from "vue";
import { useAuth } from "~/composables/useAuth";
import { useRefreshGate } from "~/composables/useRefreshGate";
import config from "~/config";
import { handleApiError, HttpError } from "~/data/appointmentsSource";
import MOCK_OFFERS_JSON from "~/data/MOCK_OFFERS.json";
import { getOffers, persistOffersCache } from "~/data/offers";
import {
  acceptOffer as apiAcceptOffer,
  declineOffer as apiDeclineOffer,
  fetchOfferDelta,
} from "~/data/offersSource";
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
  // Cursor for the delta check: the newest `updated` value findbolig.nu has reported for
  // any of this user's offers. Always sourced from the server, never a client clock —
  // see fetchOfferDelta / getOfferUpdates for why that distinction matters.
  const latestUpdated = ref<string | null>(null);
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
      latestUpdated.value = cached.latestUpdated;

      if (!auth.isAuthenticated) {
        sessionExpired.value = true;
        return;
      }

      if (latestUpdated.value) {
        // We have a cursor from a previous fetch — ask "did anything actually change"
        // instead of blindly refetching on a fixed clock.
        await checkForUpdates();
      } else {
        needsRefresh.value = true;
      }
    } catch {
      if (!auth.isAuthenticated) {
        sessionExpired.value = true;
        return;
      }
      try {
        const payload = await getOffers(true);
        offers.value = payload.offers;
        updatedAt.value = payload.updatedAt;
        latestUpdated.value = payload.latestUpdated;
      } catch (error) {
        handleApiError(error, useToastStore(), useI18n().t, "Failed to load offers");
      }
    } finally {
      isLoading.value = false;
    }
  }

  /** Merges a delta response into the local list: upserts changed offers, drops ones that left "Published". */
  function applyDelta(delta: OfferDelta) {
    if (delta.latestUpdated) latestUpdated.value = delta.latestUpdated;

    if (delta.items.length === 0 && delta.removedIds.length === 0) {
      return;
    }

    const removed = new Set(delta.removedIds);
    const byId = new Map(offers.value.filter((o) => !removed.has(o.id)).map((o) => [o.id, o]));
    for (const offer of delta.items) {
      byId.set(offer.id, offer);
    }

    offers.value = Array.from(byId.values());
    updatedAt.value = new Date();
    persistOffersCache(offers.value, updatedAt.value, latestUpdated.value);
  }

  /** Lightweight check, meant to run on every navigation to the offers view: asks the
   * server whether anything changed since our cursor, and only enriches what did. */
  async function checkForUpdates() {
    const cursor = latestUpdated.value;
    if (!cursor) return;
    try {
      applyDelta(await fetchOfferDelta(cursor));
    } catch {
      // Best-effort — keep showing cached data if the check itself fails.
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
      latestUpdated.value = payload.latestUpdated;
    } catch (error) {
      const is401 = error instanceof HttpError && error.status === 401;
      if (is401) {
        const recovered = await auth.ensureSession();
        if (recovered) {
          try {
            const payload = await getOffers(true);
            offers.value = payload.offers;
            updatedAt.value = payload.updatedAt;
            latestUpdated.value = payload.latestUpdated;
            return;
          } catch {
            // retry also failed
          }
        } else {
          sessionExpired.value = true;
          return;
        }
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
      persistOffersCache(offers.value, updatedAt.value, latestUpdated.value);
    }
  }

  const { dismissRefresh, handleRefresh } = useRefreshGate({
    needsRefresh,
    sessionExpired,
    refresh,
    onLoggedOut: () => {
      offers.value = [];
      updatedAt.value = null;
      latestUpdated.value = null;
    },
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
    dismissRefresh,
    acceptOffer,
    declineOffer,
    getImageUrl,
  };
});
