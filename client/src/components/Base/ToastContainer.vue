<script setup lang="ts">
import { useToastStore } from "~/stores/toast";
import BaseToast from "./BaseToast.vue";

const toastStore = useToastStore();
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed top-4 right-4 z-[80] flex flex-col gap-2"
      aria-live="polite"
    >
      <TransitionGroup name="toast">
        <BaseToast
          v-for="toast in toastStore.toasts"
          :key="toast.id"
          :toast="toast"
        />
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active {
  transition: all 0.3s ease-out;
}

.toast-leave-active {
  transition: all 0.2s ease-in;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(100%);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(100%);
}

.toast-move {
  transition: transform 0.3s ease;
}
</style>
