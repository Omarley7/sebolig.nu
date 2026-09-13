<script setup lang="ts">
import { useI18n } from "vue-i18n";

const props = defineProps<{
  needsRefresh: boolean;
  sessionExpired: boolean;
  isLoading: boolean;
  cacheAgeText: string;
}>();

const emit = defineEmits<{ refresh: []; dismiss: []; openLogin: [] }>();

const { t } = useI18n();
</script>

<template>
  <div v-if="props.needsRefresh || props.sessionExpired" class="mb-4 rounded-lg px-4 py-3 text-sm flex items-center justify-between gap-3"
    :class="props.sessionExpired
      ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200'
      : 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200'"
  >
    <!-- Session expired -->
    <template v-if="props.sessionExpired">
      <span>{{ t("stale.sessionExpired") }}</span>
      <button
        @click="emit('openLogin')"
        class="shrink-0 px-3 py-1 rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors text-xs font-medium"
      >
        {{ t("stale.loginAgain") }}
      </button>
    </template>

    <!-- Stale data -->
    <template v-else>
      <span>{{ t("stale.dataAge", [props.cacheAgeText]) }}</span>
      <div class="flex gap-2 shrink-0">
        <button
          @click="emit('refresh')"
          :disabled="props.isLoading"
          class="disabled:opacity-50 px-3 py-1 rounded-md bg-amber-600 text-white hover:bg-amber-700 transition-colors text-xs font-medium"
        >
          {{ t("stale.refreshNow") }}
        </button>
        <button
          @click="emit('dismiss')"
          class="px-3 py-1 rounded-md hover:bg-amber-200 dark:hover:bg-amber-800/50 transition-colors text-xs"
        >
          {{ t("stale.dismiss") }}
        </button>
      </div>
    </template>
  </div>
</template>
