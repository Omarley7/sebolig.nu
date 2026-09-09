<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { getCacheAge } from "~/data/appointments";
import { useAppointmentsStore } from "~/stores/appointments";

const store = useAppointmentsStore();
const { t } = useI18n();

const emit = defineEmits<{ openLogin: [] }>();

const cacheAgeText = computed(() => {
  const age = getCacheAge();
  if (age === null) return "";
  const hours = Math.floor(age / (1000 * 60 * 60));
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  return `${hours}h`;
});

const visible = computed(() => store.needsRefresh || store.sessionExpired);
</script>

<template>
  <div v-if="visible" class="mb-4 rounded-lg px-4 py-3 text-sm flex items-center justify-between gap-3"
    :class="store.sessionExpired
      ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200'
      : 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200'"
  >
    <!-- Session expired -->
    <template v-if="store.sessionExpired">
      <span>{{ t("stale.connectionEnded") }}</span>
      <button
        @click="emit('openLogin')"
        class="shrink-0 px-3 py-1 rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors text-xs font-medium"
      >
        {{ t("stale.connectAgain") }}
      </button>
    </template>

    <!-- Stale data -->
    <template v-else>
      <span>{{ t("stale.dataAge", [cacheAgeText]) }}</span>
      <div class="flex gap-2 shrink-0">
        <button
          @click="store.handleRefresh()"
          :disabled="store.isLoading"
          class="disabled:opacity-50 px-3 py-1 rounded-md bg-amber-600 text-white hover:bg-amber-700 transition-colors text-xs font-medium"
        >
          {{ t("stale.refreshNow") }}
        </button>
        <button
          @click="store.dismissRefresh()"
          class="px-3 py-1 rounded-md hover:bg-amber-200 dark:hover:bg-amber-800/50 transition-colors text-xs"
        >
          {{ t("stale.dismiss") }}
        </button>
      </div>
    </template>
  </div>
</template>
