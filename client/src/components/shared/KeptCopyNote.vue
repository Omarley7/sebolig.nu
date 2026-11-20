<script setup lang="ts">
import { useI18n } from "vue-i18n";

/** A card that has left its list, opened from the changes panel or Afsluttet: why, and that this is how it was. */
defineProps<{ outcome: string }>();
const { t } = useI18n();
</script>

<template>
  <div class="rounded-2xl px-4 py-3 bg-subtle">
    <p class="text-sm font-bold">{{ outcome }}</p>
    <p class="text-xs text-muted mt-0.5">{{ t("changes.keptCopy") }}</p>
  </div>
</template>
