<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { REPO_URL } from "~/config";

const { t } = useI18n();

const sections = [
  { key: "password", paragraphs: ["p1", "p2", "p3"] },
  { key: "notStored", paragraphs: ["p1"] },
  { key: "why", paragraphs: ["p1"] },
  { key: "revoke", paragraphs: ["p1", "p2", "p3"] },
  { key: "device", paragraphs: ["p1", "p2", "p3"] },
  { key: "who", paragraphs: ["p1", "p2"] },
] as const;
</script>

<template>
  <article class="max-w-2xl mx-auto py-8 px-2 space-y-8">
    <header class="space-y-3">
      <h1 class="text-3xl sm:text-4xl font-extrabold tracking-tight dark:text-white">
        {{ t("explainer.title") }}
      </h1>
      <p class="text-lg text-gray-600 dark:text-gray-300">{{ t("explainer.intro") }}</p>
    </header>

    <section v-for="section in sections" :key="section.key" class="space-y-2">
      <h2 class="text-xl font-bold dark:text-gray-100">
        {{ t(`explainer.${section.key}.title`) }}
      </h2>
      <p
        v-for="p in section.paragraphs"
        :key="p"
        class="text-gray-700 dark:text-gray-300 leading-relaxed"
      >
        {{ t(`explainer.${section.key}.${p}`) }}
      </p>
      <a
        v-if="section.key === 'who'"
        :href="REPO_URL"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-block text-violet-600 dark:text-violet-400 hover:underline font-medium"
      >
        {{ t("footer.source") }} →
      </a>
    </section>

    <router-link
      to="/"
      class="inline-block text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline"
    >
      {{ t("explainer.backToHome") }}
    </router-link>
  </article>
</template>
