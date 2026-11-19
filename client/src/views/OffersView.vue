<script setup lang="ts">
import { Inbox } from "lucide-vue-next";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import OfferDetailSheet from "~/components/offer/detail/OfferDetailSheet.vue";
import OfferRow from "~/components/offer/row/OfferRow.vue";
import MapModal from "~/components/shared/MapModal.vue";
import EmptyState from "~/components/ui/EmptyState.vue";
import ErrorBanner from "~/components/ui/ErrorBanner.vue";
import FullError from "~/components/ui/FullError.vue";
import PageHeader from "~/components/ui/PageHeader.vue";
import SkeletonRows from "~/components/ui/SkeletonRows.vue";
import TwoPane from "~/components/ui/TwoPane.vue";
import { useAutomaticChecks } from "~/composables/useAutomaticChecks";
import { useDetailSheet } from "~/composables/useDetailSheet";
import { useIsDesktop } from "~/composables/useIsDesktop";
import { useListStatus } from "~/composables/useListStatus";
import { useNow } from "~/composables/useNow";
import { useQueryTab } from "~/composables/useQueryTab";
import { removalText } from "~/lib/changeText";
import { offerPin } from "~/lib/mapPin";
import { OFFER_TABS, offerTabs, type OfferTab, type TabbedOffer } from "~/lib/offerTabs";
import { useChangesStore } from "~/stores/changes";
import { useFinishedOffersStore } from "~/stores/finishedOffers";
import { useOffersStore } from "~/stores/offers";

/**
 * Tilbud (Q7): three tabs with counts, Skal besvares, Accepteret and Afsluttet, the tab kept in
 * the address (Q26). Two panes on desktop. One "Kort" shows the active tab's offers (Q19).
 */
const store = useOffersStore();
const finished = useFinishedOffersStore();
const changes = useChangesStore();
const { t } = useI18n();
const now = useNow();
const isDesktop = useIsDesktop();

useAutomaticChecks(store);
const status = useListStatus(store);

const tab = useQueryTab<OfferTab>(OFFER_TABS, "open");
const tabs = computed(() => offerTabs(store.offers, finished.offers, now.value));
const rows = computed(() => tabs.value[tab.value]);

const TAB_LABELS: Record<OfferTab, string> = { open: "offers.tabs.open", accepted: "offers.tabs.accepted", closed: "offers.tabs.closed" };
const SUBTITLES: Record<OfferTab, string> = { open: "offers.tabs.openNote", accepted: "offers.tabs.acceptedNote", closed: "offers.tabs.closedNote" };

// Every tab's offers, finished ones included, so a link (or the pane) can name any of them.
const byId = computed(() => new Map(OFFER_TABS.flatMap((k) => tabs.value[k]).map((row) => [row.offer.id, row])));
const detail = useDetailSheet((id) => byId.value.get(id), {
  onOpen: (id) => changes.markSeen("offer", id),
  inline: () => isDesktop.value,
  fallback: () => rows.value[0]?.offer.id,
});

/** Why a finished offer left the list, for its detail: read-only then. */
function outcomeOf(row: TabbedOffer): string | null {
  if (!row.closedAt) return null;
  return removalText("offer", row.removedState ?? null, row.offer, t);
}

const showMap = ref(false);
const pins = computed(() => rows.value.map((row) => offerPin(row.offer, t)).filter((pin) => pin !== null));

// The tab's note; when the latest refresh failed, when the list was last updated instead (Q30).
const subtitle = computed(() => (store.hasData && !status.value.banner ? t(SUBTITLES[tab.value]) : status.value.subtitle));
</script>

<template>
  <TwoPane :desktop="isDesktop">
    <PageHeader
      :title="t('offers.pageTitle')"
      :subtitle="subtitle"
      :busy="store.isBusy"
      :loading="store.isLoading && !store.hasData"
      :show-map="pins.length > 0"
      @refresh="store.refresh()"
      @map="showMap = true"
    />

    <ErrorBanner v-if="status.banner" :message="t('offers.refreshFailed')" @retry="store.refresh()" />

    <div class="segments mt-3.5" role="tablist" :aria-label="t('offers.pageTitle')">
      <button
        v-for="key in OFFER_TABS"
        :key="key"
        type="button"
        role="tab"
        class="segment !text-[13px]"
        :aria-selected="tab === key"
        @click="tab = key"
      >
        {{ t(TAB_LABELS[key]) }}
        <span
          class="count-badge !min-w-5 !h-5 !text-[11px]"
          :class="key === 'open' && tabs.open.length > 0 ? 'bg-danger text-white' : 'bg-border text-ink'"
        >
          {{ tabs[key].length }}
        </span>
      </button>
    </div>

    <SkeletonRows v-if="status.skeleton && store.isLoading" :time="false" :count="3" />
    <FullError v-else-if="status.fullError" :title="t('offers.fetchFailedTitle')" :description="t('offers.refreshFailed')" @retry="store.refresh()" />
    <EmptyState
      v-else-if="store.hasData && rows.length === 0"
      :icon="Inbox"
      :title="t(`offers.empty.${tab}.title`)"
      :description="t(`offers.empty.${tab}.description`)"
    />
    <ul v-else class="flex flex-col gap-2 mt-3.5" role="tabpanel">
      <OfferRow v-for="row in rows" :key="row.offer.id" :row="row" :selected="detail.paneId === row.offer.id" />
    </ul>

    <template #pane>
      <OfferDetailSheet v-if="detail.pane" :key="detail.pane.offer.id" inline :offer="detail.pane.offer" :outcome="outcomeOf(detail.pane)" />
    </template>
  </TwoPane>

  <OfferDetailSheet
    v-if="!isDesktop && detail.item"
    :offer="detail.item.offer"
    :outcome="outcomeOf(detail.item)"
    :gone="detail.gone"
    @close="detail.onClose"
    @after-leave="detail.onAfterLeave"
  />
  <MapModal v-if="showMap" :pins="pins" :title="t('offers.pageTitle')" @select="detail.open" @close="showMap = false" />
</template>
