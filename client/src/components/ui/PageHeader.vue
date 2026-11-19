<script setup lang="ts">
import { Map as MapIcon, RefreshCw } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import ChangesBell from "~/components/changes/ChangesBell.vue";
import { useIsDesktop } from "~/composables/useIsDesktop";

/**
 * A page's title bar: the title and a subtitle (when it was last updated), the page's one "Kort"
 * button (Q19), and its refresh button, which spins while busy and stays disabled while loading.
 * On desktop the bell sits here, since the rail has none.
 */
defineProps<{
  title: string;
  subtitle?: string | null;
  busy?: boolean;
  /** Loading from scratch: the refresh button is disabled. */
  loading?: boolean;
  showMap?: boolean;
}>();
const emit = defineEmits<{ refresh: []; map: [] }>();

const { t } = useI18n();
const isDesktop = useIsDesktop();
</script>

<template>
  <div class="flex items-end justify-between gap-3 px-1 pt-5 pb-1 lg:pt-7">
    <div class="flex flex-col gap-0.5 min-w-0">
      <h1 class="text-[26px] font-extrabold tracking-tight leading-tight lg:text-[28px]">{{ title }}</h1>
      <span v-if="subtitle" class="text-[13px] text-muted">{{ subtitle }}</span>
    </div>
    <div class="flex items-center gap-2 shrink-0">
      <slot name="actions" />
      <button v-if="showMap" type="button" class="btn btn-secondary" @click="emit('map')">
        <MapIcon class="size-[18px]" aria-hidden="true" />
        {{ t("common.map") }}
      </button>
      <button
        type="button"
        class="icon-btn btn-secondary border border-border"
        :aria-label="t('common.refresh')"
        :aria-busy="busy"
        :disabled="loading"
        @click="emit('refresh')"
      >
        <RefreshCw class="size-[18px]" :class="{ 'animate-spin': busy }" aria-hidden="true" />
      </button>
      <ChangesBell v-if="isDesktop" class="ml-1" />
    </div>
  </div>
</template>
