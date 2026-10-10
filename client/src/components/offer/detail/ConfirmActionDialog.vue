<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useAuth } from "~/composables/useAuth";
import { useScrollLock } from "~/composables/useScrollLock";

const { t } = useI18n();
const auth = useAuth();
useScrollLock();

const props = defineProps<{
  action: "accept" | "decline";
  address: string;
  isLoading: boolean;
}>();

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

const title = computed(() => props.action === "accept"
  ? t("offers.confirmAcceptTitle")
  : t("offers.confirmDeclineTitle"));

const body = computed(() => props.action === "accept"
  ? t("offers.confirmAcceptBody")
  : t("offers.confirmDeclineBody"));
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <!-- Backdrop -->
      <div
        class="absolute inset-0 bg-black/60 backdrop-blur-sm"
        @click="emit('cancel')"
      />

      <!-- Dialog -->
      <div
        class="relative w-full max-w-sm bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl overflow-hidden"
      >
        <div class="p-6 text-center">
          <div class="text-3xl mb-3">{{ action === "accept" ? "\u2713" : "\u2715" }}</div>
          <h3 class="text-lg font-bold text-neutral-900 dark:text-white">
            {{ title }}
          </h3>
          <p class="mt-2 text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
            {{ body }}
            <strong class="block mt-1 text-neutral-700 dark:text-neutral-200">{{ address }}</strong>
          </p>

          <!-- User details -->
          <div class="mt-4 text-left p-3 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200/50 dark:border-white/5 text-sm">
            <div class="flex justify-between py-1 border-b border-neutral-200/50 dark:border-white/5">
              <span class="text-neutral-500 dark:text-neutral-500 font-medium">{{ t("offers.name") }}</span>
              <span class="text-neutral-700 dark:text-neutral-300">{{ auth.name }}</span>
            </div>
            <div class="flex justify-between py-1">
              <span class="text-neutral-500 dark:text-neutral-500 font-medium">{{ t("offers.email") }}</span>
              <span class="text-neutral-700 dark:text-neutral-300">{{ auth.email }}</span>
            </div>
          </div>

          <p class="mt-3 text-xs text-neutral-400 dark:text-neutral-500">
            {{ t("offers.confirmNote") }}
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
              {{ t("offers.cancel") }}
            </button>
            <button
              class="flex-1 py-3 px-4 rounded-xl font-semibold text-white transition-colors"
              :class="action === 'accept'
                ? 'bg-emerald-500 hover:bg-emerald-600'
                : 'bg-red-500 hover:bg-red-600'"
              :disabled="isLoading"
              @click="emit('confirm')"
            >
              <span v-if="isLoading" class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span v-else>{{ t("offers.confirm") }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
