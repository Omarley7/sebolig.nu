<script setup lang="ts">
/** The mark (a house with a magnifier) in the ink colour, with the wordmark. */
defineProps<{ size?: number }>();
</script>

<template>
  <span class="flex items-center gap-2 text-ink">
    <svg
      :width="size ?? 26"
      :height="size ?? 26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v9h6" />
      <circle cx="16.5" cy="16.5" r="3" />
      <path d="m21 21-2.3-2.3" />
    </svg>
    <span class="text-lg font-extrabold tracking-tight">SeBolig.nu</span>
  </span>
</template>
