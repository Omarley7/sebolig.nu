<script setup lang="ts">
import type { WaitingList } from "@/types";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import RowPhoto from "~/components/ui/RowPhoto.vue";
import { formatKr } from "~/lib/formatters";
import { useOpenDetail } from "~/composables/useDetailSheet";
import { useWaitingListsStore } from "~/stores/waitingLists";

/** A waiting list: photo, name, address, how many residences and the rent span, and the best position. Passive ones can be reactivated here. */
const props = defineProps<{ list: WaitingList }>();

const { t } = useI18n();
const store = useWaitingListsStore();
const openDetail = useOpenDetail();

const summary = computed(() => {
  const { residencesAppliedCount, minRent, maxRent } = props.list;
  const rent = formatKr(minRent) === formatKr(maxRent) ? formatKr(minRent) : `${formatKr(minRent)}–${formatKr(maxRent)}`;
  return `${t("waitingLists.card.residences", { count: residencesAppliedCount })} · ${rent}\u00a0${t("financials.krPerMonth")}`;
});
</script>

<template>
  <li class="border-b border-divider last:border-0">
    <div class="flex flex-col gap-2.5 px-4 py-3.5">
      <button type="button" class="flex gap-3 items-center text-left" @click="openDetail(list.propertyId)">
        <RowPhoto :src="list.images[0]" />
        <span class="flex-1 min-w-0 flex flex-col gap-0.5">
          <span class="text-[15px] font-bold">{{ list.name }}</span>
          <span class="text-[13px] text-muted truncate">{{ list.address }}</span>
          <span class="text-[13px] text-muted tabular-nums">{{ summary }}</span>
        </span>
        <span v-if="list.bestPosition != null" class="shrink-0 flex flex-col items-end">
          <span class="text-[11px] font-semibold text-muted">{{ t("waitingLists.card.best") }}</span>
          <span class="text-lg font-extrabold tabular-nums">#{{ list.bestPosition }}</span>
        </span>
      </button>
      <button
        v-if="list.status === 'Passive'"
        type="button"
        class="btn !rounded-[10px] bg-bg border border-border text-accent"
        :disabled="store.isMutating"
        @click="store.setActive(list.propertyId)"
      >
        {{ t("waitingLists.card.reactivate") }}
      </button>
    </div>
  </li>
</template>
