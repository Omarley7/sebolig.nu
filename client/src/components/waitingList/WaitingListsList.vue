<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useI18n } from "vue-i18n";
import CompactCardSkeleton from "~/components/shared/CompactCardSkeleton.vue";
import { useDetailSheet } from "~/composables/useDetailSheet";
import { useGroupWaitingLists } from "~/composables/useGroupWaitingLists";
import { useWaitingListsStore } from "~/stores/waitingLists";
import WaitingListGroup from "./WaitingListGroup.vue";
import WaitingListDetailSheet from "./detail/WaitingListDetailSheet.vue";

const { t } = useI18n();
const store = useWaitingListsStore();
const { lists, isLoading } = storeToRefs(store);
const { grouped } = useGroupWaitingLists(lists, t);
const detail = useDetailSheet((id) => lists.value.find((l) => l.propertyId === id));
</script>

<template>
  <div>
    <!-- Skeleton loading -->
    <div
      v-if="isLoading && !lists.length"
      class="w-full border rounded-xl p-2 dark:border-zinc-50/25 dark:bg-white/5 bg-neutral-200"
    >
      <div class="h-5 w-28 rounded-md mb-2 ml-1 bg-neutral-300/40 dark:bg-white/10" />
      <ul class="grid grid-cols-1 md:grid-cols-2 gap-1.5 p-1">
        <CompactCardSkeleton v-for="i in 4" :key="i" />
      </ul>
    </div>

    <!-- Loaded -->
    <ul v-else class="w-full space-y-2">
      <WaitingListGroup
        v-for="group in grouped"
        :key="group.key"
        class="w-full border rounded-xl p-1 dark:border-zinc-50/25 dark:bg-white/5 bg-neutral-200"
        :group-key="group.key"
        :label="group.label"
        :lists="group.lists"
        :is-first="group.isFirst"
      />
    </ul>

    <!-- Empty -->
    <div v-if="!isLoading && !lists.length" class="text-center py-12">
      <p class="text-lg font-semibold dark:text-white">{{ t("waitingLists.emptyTitle") }}</p>
      <p class="text-sm text-neutral-500 dark:text-neutral-400 mt-2 max-w-sm mx-auto">
        {{ t("waitingLists.emptyDescription") }}
      </p>
    </div>

    <WaitingListDetailSheet
      v-if="detail.item"
      :list="detail.item"
      :gone="detail.gone"
      @close="detail.onClose"
      @after-leave="detail.onAfterLeave"
    />
  </div>
</template>
