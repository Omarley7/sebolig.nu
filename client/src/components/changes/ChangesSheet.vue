<script setup lang="ts">
import { ChevronRight, Image as ImageIcon } from "lucide-vue-next";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import BottomSheet from "~/components/shared/BottomSheet.vue";
import { useSheet } from "~/composables/useSheet";
import { changeText } from "~/lib/changeText";
import { formatSentAt } from "~/lib/formatters";
import { compactThumb } from "~/lib/imageTransform";
import { imageUrl } from "~/lib/imageUrl";
import type { Change, RowTarget } from "~/localData/changes";
import { useChangesStore } from "~/stores/changes";

const { t } = useI18n();
const changes = useChangesStore();

const emit = defineEmits<{
  close: [];
  "after-leave": [];
  /** A row that opens something was tapped: the sheet closes, and `target` should open. */
  "open-row": [target: NonNullable<RowTarget>];
}>();

const sheet = useSheet();

const rows = computed(() =>
  changes.changes.map((change) => ({
    change,
    ...changeText(change, t),
    thumb: change.card.imageUrl ? compactThumb(imageUrl(change.card.imageUrl)) : undefined,
    target: changes.rowTarget(change),
  })),
);

function open(change: Change, target: NonNullable<RowTarget>) {
  changes.markSeen(change.kind, change.itemId);
  emit("open-row", target);
  sheet.close();
}
</script>

<template>
  <BottomSheet :sheet="sheet" :label="t('changes.title')" @close="emit('close')" @after-leave="emit('after-leave')">
    <div class="pb-6">
      <div class="flex items-center justify-between gap-2 pl-5 pr-14 pb-2">
        <h2 class="text-[21px] font-extrabold tracking-tight">{{ t("changes.title") }}</h2>
        <button
          v-if="changes.unseenCount > 0"
          type="button"
          class="min-h-11 px-2.5 text-sm font-semibold text-accent hover:underline"
          @click="changes.markAllSeen()"
        >
          {{ t("changes.markAllSeen") }}
        </button>
      </div>

      <p v-if="rows.length === 0" class="px-5 py-8 text-sm text-muted text-center">
        {{ t("changes.empty") }}
      </p>

      <ul class="flex flex-col gap-0.5 px-3">
        <li v-for="row in rows" :key="row.change.id">
          <component
            :is="row.target ? 'button' : 'div'"
            :type="row.target ? 'button' : undefined"
            class="w-full flex items-start gap-3 px-2 py-3 rounded-[14px] text-left"
            :class="[row.change.seenAt === null ? 'bg-tint' : '', row.target ? 'hover:bg-subtle' : '']"
            @click="row.target && open(row.change, row.target)"
          >
            <span class="relative size-12 shrink-0 rounded-[10px] overflow-hidden bg-soft text-soft-ink flex items-center justify-center">
              <ImageIcon class="size-[18px]" aria-hidden="true" />
              <img v-if="row.thumb" :src="row.thumb" alt="" class="absolute inset-0 size-full object-cover" loading="lazy" />
            </span>
            <span class="flex-1 min-w-0 flex flex-col gap-[3px]">
              <span class="flex justify-between gap-2 text-xs text-muted">
                <span class="truncate">{{ row.change.card.addressLine1 }}</span>
                <span class="shrink-0 tabular-nums">{{ formatSentAt(row.change.at) }}</span>
              </span>
              <span
                class="flex items-center gap-1.5 text-sm"
                :class="row.change.seenAt === null ? 'font-bold text-ink' : 'font-medium text-ink-2'"
              >
                <span v-if="row.change.seenAt === null" class="size-2 shrink-0 rounded-full bg-accent" role="img" :aria-label="t('changes.unseen')" />
                <span class="min-w-0">{{ row.text }}</span>
              </span>
              <span v-if="row.quote" class="text-[13px] text-muted truncate">„{{ row.quote }}“</span>
            </span>
            <ChevronRight v-if="row.target" class="size-4 mt-4 shrink-0 text-muted" aria-hidden="true" />
          </component>
        </li>
      </ul>
    </div>
  </BottomSheet>
</template>
