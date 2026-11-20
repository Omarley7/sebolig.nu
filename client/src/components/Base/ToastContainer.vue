<script setup lang="ts">
import { useToastStore } from "~/stores/toast";
import BaseToast from "./BaseToast.vue";

/** Toasts stack at the bottom, above the bottom nav on phones; bottom right on desktop. */
defineProps<{ aboveNav?: boolean }>();
const toastStore = useToastStore();
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-x-3 z-[80] flex flex-col items-center gap-2 pointer-events-none lg:inset-x-auto lg:right-6 lg:items-end"
      :class="aboveNav ? 'bottom-[calc(80px+env(safe-area-inset-bottom,0px))]' : 'bottom-6'"
      aria-live="polite"
    >
      <TransitionGroup name="toast">
        <BaseToast v-for="toast in toastStore.toasts" :key="toast.id" :toast="toast" class="pointer-events-auto" />
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active {
  transition: all 0.25s ease-out;
}
.toast-leave-active {
  transition: all 0.2s ease-in;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
.toast-move {
  transition: transform 0.25s ease;
}
</style>
