<script setup lang="ts">
import { useI18n } from "vue-i18n";
import ConnectForm from "~/components/ConnectForm.vue";

const { t } = useI18n();
</script>

<template>
  <div class="flex flex-col items-center gap-8 py-12 px-4 max-w-lg md:max-w-3xl mx-auto">
    <!-- Hero -->
    <div class="text-center space-y-4">
      <h1 class="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight dark:text-white">
        {{ t("home.welcome") }}
      </h1>
      <p class="text-xl text-gray-600 dark:text-gray-300 font-medium">{{ t("landing.tagline") }}</p>
      <p class="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
        {{ t("landing.description") }}
      </p>
    </div>

    <!-- Video + connect form side by side on md+ -->
    <div class="w-full flex flex-col md:flex-row md:items-stretch gap-6">
      <!-- Preview video -->
      <div
        class="w-fit mx-auto md:mx-0 md:w-auto md:flex-1 rounded-xl overflow-hidden shadow-md border border-neutral-200 dark:border-neutral-700/50"
      >
        <video
          src="/preview_12032026.mp4"
          autoplay
          loop
          muted
          playsinline
          class="md:w-full object-contain max-h-[calc(100dvh-3.5rem-5rem)]"
        />
      </div>

      <!-- Connect form -->
      <div
        class="w-full md:flex-1 bg-violet-50 dark:bg-violet-950 border border-violet-200 dark:border-violet-800/50 rounded-lg shadow-lg p-6"
      >
        <ConnectForm />
      </div>
    </div>
    <!-- end video + connect row -->

    <!-- Feature highlights -->
    <ul class="text-sm text-gray-500 dark:text-gray-400 space-y-2 text-left w-full">
      <li>&#10003; {{ t("landing.featureAppointments") }}</li>
      <li>&#10003; {{ t("landing.featureOffline") }}</li>
      <li>&#10003; {{ t("landing.featureAI") }}</li>
    </ul>
  </div>
</template>
