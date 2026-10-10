<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useScrollLock } from "~/composables/useScrollLock";

const { t } = useI18n();
useScrollLock();

const props = defineProps<{
  name: string;
  isLoading: boolean;
}>();

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

function onBackdropClick() {
  if (!props.isLoading) emit("cancel");
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <!-- Backdrop -->
      <div
        class="absolute inset-0 bg-black/60 backdrop-blur-sm"
        @click="onBackdropClick"
      />

      <!-- Dialog -->
      <div
        class="relative w-full max-w-sm bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl overflow-hidden"
      >
        <div class="p-6 text-center">
          <div class="text-3xl mb-3">&#x26A0;</div>
          <h3 class="text-lg font-bold text-neutral-900 dark:text-white">
            {{ t("waitingLists.confirm.unsubscribeTitle", { name }) }}
          </h3>
          <p class="mt-2 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
            {{ t("waitingLists.confirm.unsubscribeBody") }}
          </p>

          <!-- Actions -->
          <div class="flex gap-3 mt-5">
            <button
              class="flex-1 py-3 px-4 rounded-xl border border-neutral-200 dark:border-neutral-700/50
                     text-neutral-600 dark:text-neutral-400 font-medium
                     hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors"
              :disabled="isLoading"
              @click="emit('cancel')"
            >
              {{ t("waitingLists.confirm.cancel") }}
            </button>
            <button
              class="flex-1 py-3 px-4 rounded-xl font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors"
              :disabled="isLoading"
              @click="emit('confirm')"
            >
              <span v-if="isLoading" class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span v-else>{{ t("waitingLists.confirm.confirm") }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
