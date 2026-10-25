<script setup lang="ts">
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
  <BottomSheet :sheet="sheet" @close="emit('close')" @after-leave="emit('after-leave')">
    <div class="p-5 pt-1">
      <div class="flex items-center justify-between gap-3 mb-3 pr-10">
        <h2 class="text-lg font-bold text-neutral-900 dark:text-white">{{ t("changes.title") }}</h2>
        <button
          v-if="changes.unseenCount > 0"
          class="text-sm font-medium text-sky-600 dark:text-sky-400 hover:underline"
          @click="changes.markAllSeen()"
        >
          {{ t("changes.markAllSeen") }}
        </button>
      </div>

      <p v-if="rows.length === 0" class="text-sm text-neutral-500 dark:text-neutral-400 py-6 text-center">
        {{ t("changes.empty") }}
      </p>

      <ul class="space-y-1">
        <li v-for="row in rows" :key="row.change.id">
          <component
            :is="row.target ? 'button' : 'div'"
            :type="row.target ? 'button' : undefined"
            class="w-full flex items-center gap-3 p-2 rounded-xl text-left transition-colors"
            :class="[
              row.target && 'hover:bg-neutral-100 dark:hover:bg-white/[0.06] cursor-pointer',
              row.change.seenAt !== null && 'opacity-50',
            ]"
            @click="row.target && open(row.change, row.target)"
          >
            <div class="relative w-16 shrink-0 aspect-[3/2] rounded-md overflow-hidden bg-neutral-200 dark:bg-white/10">
              <img v-if="row.thumb" :src="row.thumb" alt="" class="absolute inset-0 w-full h-full object-cover" loading="lazy" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-baseline gap-2">
                <p class="text-xs text-neutral-500 dark:text-neutral-400 truncate flex-1">
                  {{ row.change.card.addressLine1 }}
                </p>
                <span class="text-[0.625rem] tabular-nums text-neutral-400 dark:text-neutral-500 shrink-0">
                  {{ formatSentAt(row.change.at) }}
                </span>
              </div>
              <p class="text-sm font-medium text-neutral-800 dark:text-neutral-100 flex items-center gap-1.5">
                <span
                  v-if="row.change.seenAt === null"
                  class="inline-block size-2 rounded-full bg-sky-500 shrink-0"
                />
                <span class="min-w-0">{{ row.text }}</span>
              </p>
              <p v-if="row.quote" class="text-xs text-neutral-500 dark:text-neutral-400 truncate">“{{ row.quote }}”</p>
            </div>
            <img v-if="row.target" src="/icons/chevron-down.svg" alt="" class="size-4 -rotate-90 opacity-30 dark:invert shrink-0" />
          </component>
        </li>
      </ul>
    </div>
  </BottomSheet>
</template>
