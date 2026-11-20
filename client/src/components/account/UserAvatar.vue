<script setup lang="ts">
import { computed } from "vue";
import { useAuth } from "~/composables/useAuth";

defineProps<{ large?: boolean }>();
const auth = useAuth();
const initial = computed(() => (auth.name?.trim()[0] ?? "?").toUpperCase());
</script>

<template>
  <span
    aria-hidden="true"
    class="shrink-0 rounded-full bg-soft text-soft-ink font-bold flex items-center justify-center"
    :class="large ? 'size-[52px] text-xl font-extrabold' : 'size-[30px] text-[13px]'"
  >
    {{ initial }}
  </span>
</template>
