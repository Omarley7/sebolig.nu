<script setup lang="ts">
import { X } from "lucide-vue-next";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useWaitingListsStore } from "~/stores/waitingLists";

/** "You've been set passive": in the amber soft fill, with one button that reactivates them all. */
const { t } = useI18n();
const store = useWaitingListsStore();

const count = computed(() => store.lists.filter((l) => store.recentlyPassivated.includes(l.propertyId)).length);
</script>

<template>
  <div v-if="count > 0" class="flex flex-col gap-3 mt-4 px-4 py-3.5 rounded-2xl bg-soft text-soft-ink">
    <div class="flex items-start justify-between gap-2">
      <div class="flex flex-col gap-1">
        <span class="text-[15px] font-bold">{{ t("waitingLists.banner.title") }}</span>
        <span class="text-[13px] leading-snug">{{ t("waitingLists.banner.body", { count }) }}</span>
      </div>
      <button
        type="button"
        class="icon-btn -mr-3 -mt-3 !text-soft-ink"
        :aria-label="t('waitingLists.banner.dismiss')"
        @click="store.dismissPassivatedBanner()"
      >
        <X class="size-5" aria-hidden="true" />
      </button>
    </div>
    <button type="button" class="btn btn-primary" :disabled="store.isMutating" @click="store.reactivateAll()">
      <template v-if="store.bulkInProgress">{{ t("waitingLists.actions.reactivating", { done: store.bulkDone, total: store.bulkTotal }) }}</template>
      <template v-else>{{ t("waitingLists.actions.reactivateAll") }}</template>
    </button>
  </div>
</template>
