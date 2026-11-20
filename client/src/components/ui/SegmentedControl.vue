<script setup lang="ts" generic="T extends string">
/** Two or three options side by side, the chosen one raised: language, theme. */
defineProps<{ options: { value: T; label: string }[]; label: string }>();
const model = defineModel<T>({ required: true });
</script>

<template>
  <div class="segments" role="group" :aria-label="label">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="segment"
      :aria-pressed="model === option.value"
      @click="model = option.value"
    >
      {{ option.label }}
    </button>
  </div>
</template>
