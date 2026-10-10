<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";
import OfferGroup from "~/components/offer/OfferGroup.vue";
import OfferDetailSheet from "~/components/offer/detail/OfferDetailSheet.vue";
import CompactCardSkeleton from "~/components/shared/CompactCardSkeleton.vue";
import { useDetailSheet } from "~/composables/useDetailSheet";
import { useGroupOffers } from "~/composables/useGroupOffers";
import { useOffersStore } from "~/stores/offers";

const { t } = useI18n();
const store = useOffersStore();
const { offers, isLoading } = storeToRefs(store);
const { groupedOffers } = useGroupOffers(offers, t);
const detail = useDetailSheet((id) => offers.value.find((o) => o.id === id));
</script>

<template>
  <div>
    <!-- Skeleton loading state -->
    <div v-if="isLoading && !offers.length"
      class="w-full border rounded-xl p-2 dark:border-zinc-50/25 dark:bg-white/5 bg-neutral-200">
      <div class="h-5 w-28 rounded-md mb-2 ml-1 bg-neutral-300/40 dark:bg-white/10" />
      <ul class="grid grid-cols-1 md:grid-cols-2 gap-1.5 p-1">
        <CompactCardSkeleton v-for="i in 3" :key="i" />
      </ul>
    </div>

    <!-- Loaded offers -->
    <ul v-else class="w-full space-y-2">
      <OfferGroup
        v-for="group in groupedOffers"
        :key="group.key"
        class="w-full border rounded-xl p-1 dark:border-zinc-50/25 dark:bg-white/5 bg-neutral-200"
        :group-key="group.key"
        :label="group.label"
        :offers="group.offers"
        :is-first="group.isFirst"
      />
    </ul>

    <!-- Empty state -->
    <div v-if="!isLoading && !offers.length" class="text-center py-12">
      <p class="text-lg font-semibold dark:text-white">{{ t("offers.emptyTitle") }}</p>
      <p class="text-sm text-neutral-500 dark:text-neutral-400 mt-2 max-w-sm mx-auto">
        {{ t("offers.emptyDescription") }}
      </p>
    </div>

    <OfferDetailSheet
      v-if="detail.item"
      :offer="detail.item"
      :gone="detail.gone"
      @close="detail.onClose"
      @after-leave="detail.onAfterLeave"
    />
  </div>
</template>
