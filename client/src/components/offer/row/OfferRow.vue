<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import RowPhoto from "~/components/ui/RowPhoto.vue";
import { useOpenDetail } from "~/composables/useDetailSheet";
import { formatKr, formatPlaceFacts } from "~/lib/formatters";
import { chipClasses, offerChip } from "~/lib/offerChip";
import type { TabbedOffer } from "~/lib/offerTabs";
import { useChangesStore } from "~/stores/changes";

/**
 * An offer on Tilbud (Q15): the photo on the left, the deadline chip at the top right, and a
 * footer with rent and queue position. Finished offers have a muted title and a status chip.
 */
const props = defineProps<{ row: TabbedOffer; selected?: boolean }>();

const { t, locale } = useI18n();
const openDetail = useOpenDetail();
const changes = useChangesStore();

const offer = computed(() => props.row.offer);
const chip = computed(() => offerChip(props.row, t, locale.value));
const facts = computed(() => formatPlaceFacts({ addressLine2: offer.value.residence.addressLine2, rooms: offer.value.rooms, area: offer.value.area }, t));
const changed = computed(() => changes.hasUnseen("offer", offer.value.id));
</script>

<template>
  <li>
    <button
      type="button"
      class="card card-link w-full flex gap-3 py-3 px-3.5 text-left"
      :class="selected ? '!border-accent ring-1 ring-accent' : ''"
      :aria-current="selected ? 'true' : undefined"
      @click="openDetail(offer.id)"
    >
      <RowPhoto :src="offer.imageUrl" :size="64" />
      <span class="flex-1 min-w-0 flex flex-col gap-2">
        <span class="flex items-start justify-between gap-2">
          <span class="flex flex-col gap-0.5 min-w-0">
            <span class="text-[15px] font-bold" :class="row.closed ? 'text-ink-2' : 'text-ink'">
              <span v-if="changed" class="inline-block size-2 mr-1 rounded-full bg-accent align-middle" role="img" :aria-label="t('changes.changed')" />
              {{ offer.residence.addressLine1 }}
            </span>
            <span v-if="facts" class="text-[13px] text-muted">{{ facts }}</span>
          </span>
          <span class="shrink-0 flex flex-col items-end gap-[3px]">
            <span class="chip !py-[5px]" :class="chipClasses[chip.tone]">{{ chip.label }}</span>
            <span v-if="chip.sub" class="text-xs text-muted">{{ chip.sub }}</span>
          </span>
        </span>
        <span class="flex items-center justify-between gap-2">
          <span class="text-[15px] font-bold tabular-nums">
            {{ formatKr(offer.financials.monthlyRentIncludingAconto) }}
            <span class="text-[13px] font-medium text-muted">{{ t("financials.krPerMonth") }}</span>
          </span>
          <span v-if="offer.position != null" class="text-[13px] font-semibold text-muted">{{ t("common.queuePositionCap", { n: offer.position }) }}</span>
        </span>
      </span>
    </button>
  </li>
</template>
