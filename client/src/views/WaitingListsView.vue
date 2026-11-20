<script setup lang="ts">
import type { WaitingList } from "@/types";
import { List } from "lucide-vue-next";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import MapModal from "~/components/shared/MapModal.vue";
import EmptyState from "~/components/ui/EmptyState.vue";
import ErrorBanner from "~/components/ui/ErrorBanner.vue";
import FullError from "~/components/ui/FullError.vue";
import PageHeader from "~/components/ui/PageHeader.vue";
import SkeletonRows from "~/components/ui/SkeletonRows.vue";
import PassivatedBanner from "~/components/waitingList/PassivatedBanner.vue";
import WaitingListRow from "~/components/waitingList/WaitingListRow.vue";
import WaitingListDetailSheet from "~/components/waitingList/detail/WaitingListDetailSheet.vue";
import { useAutomaticChecks } from "~/composables/useAutomaticChecks";
import { useDetailSheet } from "~/composables/useDetailSheet";
import { useListStatus } from "~/composables/useListStatus";
import type { MapPin } from "~/lib/mapPin";
import { useWaitingListsStore } from "~/stores/waitingLists";

/** Ventelister: the passive lists first, each with "Meld mig aktiv", then the active ones. */
const store = useWaitingListsStore();
const { t } = useI18n();

useAutomaticChecks(store);
const status = useListStatus(store);

const byName = (a: WaitingList, b: WaitingList) => a.name.localeCompare(b.name, "da");
const groups = computed(() =>
  [
    { key: "passive", label: t("waitingLists.groups.passive"), lists: store.lists.filter((l) => l.status === "Passive").sort(byName) },
    { key: "active", label: t("waitingLists.groups.active"), lists: store.lists.filter((l) => l.status === "Active").sort(byName) },
  ].filter((group) => group.lists.length > 0),
);

const detail = useDetailSheet((id) => store.lists.find((l) => l.propertyId === id));

const subtitle = computed(() =>
  store.hasData ? `${t("waitingLists.count", { count: store.lists.length })} · ${status.value.subtitle}` : status.value.subtitle,
);

const showMap = ref(false);
const pins = computed<MapPin[]>(() =>
  store.lists
    .filter((l) => l.location)
    .map((l) => ({ id: l.propertyId, lat: l.location!.latitude, lng: l.location!.longitude, label: l.name, sublabel: l.address, details: [] })),
);
</script>

<template>
  <div class="lg:max-w-3xl">
    <PageHeader
      :title="t('waitingLists.pageTitle')"
      :subtitle="subtitle"
      :busy="store.isBusy"
      :loading="store.isLoading && !store.hasData"
      :show-map="pins.length > 0"
      @refresh="store.refresh()"
      @map="showMap = true"
    />
    <ErrorBanner v-if="status.banner" :message="t('waitingLists.refreshFailed')" @retry="store.refresh()" />
    <PassivatedBanner />

    <SkeletonRows v-if="status.skeleton && store.isLoading" :time="false" />
    <FullError
      v-else-if="status.fullError"
      :title="t('waitingLists.fetchFailedTitle')"
      :description="t('waitingLists.refreshFailed')"
      @retry="store.refresh()"
    />
    <EmptyState
      v-else-if="store.hasData && store.lists.length === 0"
      :icon="List"
      :title="t('waitingLists.emptyTitle')"
      :description="t('waitingLists.emptyDescription')"
    />
    <section v-for="group in groups" v-else :key="group.key" class="flex flex-col gap-2 mt-4">
      <h2 class="px-1 text-[17px] font-bold">
        {{ group.label }} <span class="text-sm font-semibold text-muted">{{ group.lists.length }}</span>
      </h2>
      <ul class="card overflow-hidden">
        <WaitingListRow v-for="list in group.lists" :key="list.propertyId" :list="list" />
      </ul>
    </section>
  </div>

  <WaitingListDetailSheet v-if="detail.item" :list="detail.item" :gone="detail.gone" @close="detail.onClose" @after-leave="detail.onAfterLeave" />
  <MapModal v-if="showMap" :pins="pins" :title="t('waitingLists.pageTitle')" @select="detail.open" @close="showMap = false" />
</template>
