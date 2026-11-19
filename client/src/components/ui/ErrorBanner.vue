<script setup lang="ts">
import { TriangleAlert } from "lucide-vue-next";
import { useI18n } from "vue-i18n";

/** A slim banner above data that is still shown, but could not be updated (Q30). */
defineProps<{ message: string }>();
const emit = defineEmits<{ retry: [] }>();
const { t } = useI18n();
</script>

<template>
  <div role="alert" class="flex items-center gap-2.5 mt-3 py-2 pl-3.5 pr-2 rounded-[14px] bg-urgent text-urgent-ink">
    <TriangleAlert class="size-[18px] shrink-0" aria-hidden="true" />
    <span class="flex-1 text-[13px] leading-snug font-semibold">{{ message }}</span>
    <button type="button" class="shrink-0 min-h-11 px-3 rounded-[10px] bg-surface text-urgent-ink text-[13px] font-bold" @click="emit('retry')">
      {{ t("common.tryAgain") }}
    </button>
  </div>
</template>
