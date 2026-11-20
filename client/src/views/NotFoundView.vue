<script setup lang="ts">
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-3.5 px-6 py-24 text-center">
    <span class="text-[72px] leading-none font-extrabold tracking-tighter text-soft-ink">404</span>
    <h1 class="text-[22px] font-extrabold">{{ t("common.pageNotFound") }}</h1>
    <router-link to="/" class="btn btn-primary !min-h-12 mt-2 !px-[22px] !text-[15px] !font-bold">{{ t("common.backToHome") }}</router-link>
  </div>
</template>
