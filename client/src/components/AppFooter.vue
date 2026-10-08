<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { REPO_URL } from "~/config";

const { t } = useI18n();
</script>

<template>
  <footer
    class="w-full max-w-5xl mx-auto px-4 py-6 text-xs text-gray-400 dark:text-gray-500 text-center space-y-1"
  >
    <p>
      <router-link :to="{ name: 'explainer' }" class="underline hover:text-gray-600 dark:hover:text-gray-300">
        {{ t("explainer.linkLabel") }}
      </router-link>
      <span class="mx-2" aria-hidden="true">·</span>
      <a
        :href="REPO_URL"
        target="_blank"
        rel="noopener noreferrer"
        class="underline hover:text-gray-600 dark:hover:text-gray-300"
      >
        {{ t("common.sourceCode") }}
      </a>
    </p>
    <p>{{ t("footer.notAffiliated") }}</p>
  </footer>
</template>
