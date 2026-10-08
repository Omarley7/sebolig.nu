<script setup lang="ts">
import { useDarkMode } from "~/composables/useDarkMode";
import { useI18n } from "../i18n";
import LanguageSwitcher from "./LanguageSwitcher.vue";
import ConnectionControl from "./ConnectionControl.vue";

const { t } = useI18n();
const { isDark, toggle: toggleDarkMode } = useDarkMode();
</script>

<template>
  <nav class="flex items-center gap-3">
    <!-- Left: logo (equal width to right for centering) -->
    <router-link to="/" class="flex-1 flex items-center">
      <img v-if="isDark" src="/sebolig_logo_dark.svg" alt="SeBolig.nu" class="h-8" />
      <img v-else src="/sebolig_logo_light.svg" alt="SeBolig.nu" class="h-8" />
    </router-link>

    <!-- Center: title (true center, shrinks on small screens) -->
    <router-link to="/" class="min-w-0 shrink-0 text-center">
      <h1 class="truncate font-bold dark:text-neutral-200 text-neutral-700 max-sm:text-2xl! sm:pb-2">
        {{ t("common.appTitle") }}
      </h1>
    </router-link>

    <!-- Right: dark mode toggle + connect (equal width to left for centering) -->
    <div class="flex-1 flex items-center justify-end gap-2">
      <LanguageSwitcher />
      <button
        @click="toggleDarkMode"
        class="p-1.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
        :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
      >
        <img v-if="isDark" src="/icons/sun.svg" alt="Light mode" class="size-5 invert" />
        <img v-else src="/icons/moon.svg" alt="Dark mode" class="size-5" />
      </button>
      <ConnectionControl class="transition-transform hover:scale-125" />
    </div>
  </nav>
</template>
