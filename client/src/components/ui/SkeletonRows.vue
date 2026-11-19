<script setup lang="ts">
/** Placeholder rows shaped like the real ones (Q30): time column, three text lines and a photo. */
withDefaults(defineProps<{ count?: number; time?: boolean }>(), { count: 4, time: true });
</script>

<template>
  <div class="flex flex-col gap-2 mt-4" aria-hidden="true">
    <div v-for="i in count" :key="i" class="card flex gap-3 p-3.5 pl-4">
      <div v-if="time" class="w-[52px] shrink-0 flex flex-col gap-1.5 pt-0.5">
        <span class="h-4 w-11 rounded bg-skeleton animate-pulse" />
        <span class="h-3 w-8 rounded bg-skeleton animate-pulse" />
      </div>
      <div class="flex-1 flex flex-col gap-2 pt-0.5">
        <span class="h-4 w-3/4 rounded bg-skeleton animate-pulse" />
        <span class="h-3 w-1/2 rounded bg-skeleton animate-pulse" />
        <span class="h-3 w-2/5 rounded bg-skeleton animate-pulse" />
      </div>
      <span class="size-14 shrink-0 rounded-xl bg-skeleton animate-pulse" />
    </div>
  </div>
</template>
