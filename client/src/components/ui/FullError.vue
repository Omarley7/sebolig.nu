<script setup lang="ts">
import { CloudOff } from "lucide-vue-next";
import { useI18n } from "vue-i18n";

/** The page couldn't be fetched and nothing is stored to show instead (Q30). */
defineProps<{ title: string; description: string }>();
const emit = defineEmits<{ retry: [] }>();
const { t } = useI18n();
</script>

<template>
  <div role="alert" class="flex flex-col items-center gap-3 px-6 py-16 text-center">
    <span class="size-14 rounded-2xl bg-chip text-chip-ink flex items-center justify-center">
      <CloudOff class="size-6" aria-hidden="true" />
    </span>
    <h2 class="text-lg font-extrabold">{{ title }}</h2>
    <p class="max-w-sm text-[15px] leading-normal text-muted">{{ description }}</p>
    <button type="button" class="btn btn-primary mt-2 !px-6" @click="emit('retry')">{{ t("common.tryAgain") }}</button>
  </div>
</template>
