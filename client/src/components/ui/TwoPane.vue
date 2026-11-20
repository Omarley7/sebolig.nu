<script setup lang="ts">
/**
 * Fremvisninger and Tilbud on desktop (Q14): the list on the left, the selected item's detail on
 * the right, beside it. Below lg there is only the list; the detail opens as a sheet.
 */
defineProps<{ desktop: boolean }>();
</script>

<template>
  <div v-if="desktop" class="grid grid-cols-[minmax(0,1fr)_minmax(0,520px)] gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
    <div class="min-w-0"><slot /></div>
    <div class="sticky top-0 h-dvh py-6">
      <slot name="pane" />
    </div>
  </div>
  <slot v-else />
</template>
