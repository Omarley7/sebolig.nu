<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useWaitingListsStore } from "~/stores/waitingLists";

const { t } = useI18n();
const store = useWaitingListsStore();

const affected = computed(() =>
  store.lists.filter((l) => store.recentlyPassivated.includes(l.propertyId)),
);

const count = computed(() => affected.value.length);

const nameList = computed(() => affected.value.map((l) => l.name).join(", "));
</script>

<template>
  <div
    v-if="count > 0"
    class="mb-3 p-3 rounded-xl border border-amber-300/50 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30"
  >
    <div class="flex items-start justify-between gap-3">
      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold text-amber-900 dark:text-amber-200">
          {{ t("waitingLists.banner.title") }}
        </p>
        <p class="mt-1 text-xs text-amber-800 dark:text-amber-300/90 leading-snug">
          {{ t("waitingLists.banner.body", { count }) }}
        </p>
        <p
          v-if="nameList"
          class="mt-1 text-xs text-amber-700/80 dark:text-amber-300/70 truncate"
          :title="nameList"
        >
          {{ nameList }}
        </p>
      </div>
      <button
        class="shrink-0 p-1 rounded-md hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors"
        :aria-label="t('waitingLists.banner.dismiss')"
        @click="store.dismissPassivatedBanner()"
      >
        <img src="/icons/x.svg" alt="" class="size-4 opacity-60 dark:invert" />
      </button>
    </div>
    <button
      class="mt-2 w-full py-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold transition-colors disabled:opacity-60"
      :disabled="store.isMutating"
      @click="store.reactivateAll()"
    >
      <template v-if="store.bulkInProgress">
        {{ t("waitingLists.actions.reactivating", { done: store.bulkDone, total: store.bulkTotal }) }}
      </template>
      <template v-else>
        {{ t("waitingLists.actions.reactivateAll") }}
      </template>
    </button>
  </div>
</template>
