<script setup lang="ts">
import type { WaitingList } from "@/types";
import { computed, nextTick, ref } from "vue";
import { useI18n } from "vue-i18n";
import { compactThumb } from "~/lib/imageTransform";
import { formatCurrency } from "~/lib/formatters";
import { useWaitingListsStore } from "~/stores/waitingLists";
import WaitingListDetailSheet from "../detail/WaitingListDetailSheet.vue";

const { t } = useI18n();
const store = useWaitingListsStore();
const { getImageUrl } = store;

const props = defineProps<{
  list: WaitingList;
  loadImage?: boolean;
}>();

const showDetail = ref(false);
const detailMounted = ref(false);

function openDetail() {
  showDetail.value = true;
  detailMounted.value = true;
}

function onDetailClose() {
  showDetail.value = false;
}

async function onDetailAfterLeave() {
  if (showDetail.value) {
    detailMounted.value = false;
    await nextTick();
    detailMounted.value = true;
  } else {
    detailMounted.value = false;
  }
}

const thumbUrl = computed(() => {
  if (props.loadImage === false) return undefined;
  const first = props.list.images[0];
  if (!first) return undefined;
  return compactThumb(getImageUrl(first));
});

async function handleReactivate(e: MouseEvent) {
  e.stopPropagation();
  await store.setActive(props.list.propertyId);
}
</script>

<template>
  <li>
    <div
      class="flex gap-3 p-2 rounded-xl
             bg-white/80 dark:bg-white/[0.06]
             hover:bg-white dark:hover:bg-white/[0.10]
             border border-transparent dark:border-white/[0.04] hover:border-neutral-200/50 dark:hover:border-white/[0.08]
             cursor-pointer transition-all duration-150
             active:scale-[0.99] select-none"
      @click="openDetail"
    >
      <!-- Thumbnail -->
      <div class="relative w-24 md:w-32 shrink-0 aspect-[3/2] rounded-lg overflow-hidden bg-neutral-200 dark:bg-white/10">
        <img
          v-if="thumbUrl"
          :src="thumbUrl"
          :alt="list.name"
          class="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
        <span
          class="absolute top-1.5 left-1.5 px-1.5 py-0.5 text-[0.625rem] font-semibold rounded-md"
          :class="list.status === 'Active'
            ? 'bg-emerald-500 text-white'
            : 'bg-amber-500 text-white'"
        >
          {{ list.status === "Active" ? t("waitingLists.card.statusActive") : t("waitingLists.card.statusPassive") }}
        </span>
      </div>

      <!-- Text content -->
      <div class="flex flex-col justify-between min-w-0 flex-1 py-0.5">
        <div class="min-w-0">
          <p class="font-semibold text-[0.8125rem] leading-snug truncate dark:text-neutral-100">
            {{ list.name }}
          </p>
          <p class="text-xs text-neutral-500 dark:text-neutral-400 truncate">
            {{ list.address }}
          </p>
        </div>

        <div class="flex items-end justify-between gap-2 mt-auto">
          <div class="min-w-0">
            <p class="text-[0.625rem] font-medium text-neutral-500 dark:text-neutral-400">
              {{ t("waitingLists.card.residencesApplied", { count: list.residencesAppliedCount }) }}
            </p>
            <p class="text-[0.8125rem] font-medium tabular-nums dark:text-neutral-200">
              {{ formatCurrency(list.minRent) }}–{{ formatCurrency(list.maxRent) }}
            </p>
          </div>

          <div v-if="list.bestPosition != null" class="text-right shrink-0">
            <p class="text-[0.625rem] font-medium text-neutral-500 dark:text-neutral-400 leading-tight">
              {{ t("waitingLists.card.bestPosition") }}
            </p>
            <p class="text-base font-bold tabular-nums leading-tight text-neutral-800 dark:text-neutral-200">
              #{{ list.bestPosition }}
            </p>
          </div>
        </div>

        <button
          v-if="list.status === 'Passive'"
          class="mt-1.5 w-full py-1.5 px-2 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold transition-colors disabled:opacity-60"
          :disabled="store.isMutating"
          @click="handleReactivate"
        >
          {{ t("waitingLists.card.reactivate") }}
        </button>
      </div>
    </div>

    <WaitingListDetailSheet
      v-if="detailMounted"
      :list="list"
      @close="onDetailClose"
      @after-leave="onDetailAfterLeave"
    />
  </li>
</template>
