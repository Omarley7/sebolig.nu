<script setup lang="ts">
/** Nothing to show (Q30): an icon tile, a title and what to do about it. */
defineProps<{ icon: unknown; title: string; description?: string }>();
</script>

<template>
  <div class="flex flex-col items-center gap-3 px-6 py-14 text-center">
    <span class="size-14 rounded-2xl bg-soft text-soft-ink flex items-center justify-center">
      <component :is="icon" class="size-6" aria-hidden="true" />
    </span>
    <h2 class="text-lg font-extrabold">{{ title }}</h2>
    <p v-if="description" class="max-w-sm text-[15px] leading-normal text-muted">{{ description }}</p>
    <slot />
  </div>
</template>
