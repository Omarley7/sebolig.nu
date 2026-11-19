<script setup lang="ts">
import type { Sheet } from "~/composables/useSheet";
import BottomSheet from "./BottomSheet.vue";

/**
 * Where a detail shows: a bottom sheet on phones, or inline in the desktop pane (Q14). The detail
 * is the same component either way; its primary actions sit in `footer`, pinned to the bottom.
 */
defineProps<{ sheet: Sheet; inline?: boolean; label?: string }>();
const emit = defineEmits<{ close: []; "after-leave": [] }>();
</script>

<template>
  <section v-if="inline" class="card h-full min-h-0 flex flex-col overflow-hidden" :aria-label="label">
    <div class="flex-1 min-h-0 overflow-y-auto" data-sheet-scroll>
      <slot />
    </div>
    <slot name="footer" />
    <slot name="popups" />
  </section>
  <BottomSheet v-else :sheet="sheet" :label="label" @close="emit('close')" @after-leave="emit('after-leave')">
    <slot />
    <template #footer><slot name="footer" /></template>
    <template #popups><slot name="popups" /></template>
  </BottomSheet>
</template>
