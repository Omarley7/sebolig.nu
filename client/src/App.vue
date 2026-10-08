<script setup lang="ts">
import { watch } from "vue";
import { useRouter } from "vue-router";
import AppHeader from "~/components/AppHeader.vue";
import ToastContainer from "~/components/Base/ToastContainer.vue";
import AppFooter from "~/components/AppFooter.vue";
import BottomNav from "~/components/BottomNav.vue";
import { useAuth } from "~/composables/useAuth";
import config from "./config";

const auth = useAuth();
const router = useRouter();

if (
  `${config.backendDomain}` &&
  `${config.backendDomain}`.split(":")[1] !== window.location.origin.split(":")[1]
) {
  alert(
    `Backend domain ${config.backendDomain} does not match the current origin ${window.location.origin} - will result in CORS errors.`,
  );
}

watch(
  () => auth.isAuthenticated,
  (isAuthenticated) => {
    if (!isAuthenticated) router.push("/");
  },
);
</script>

<template>
  <div class="min-h-dvh flex flex-col">
    <AppHeader
      class="sticky top-0 z-30 backdrop-blur-md bg-white/80 dark:bg-zinc-900/80 border-b border-zinc-200 dark:border-zinc-700/50 px-4 py-2"
    />

    <main class="flex-1 w-full max-w-5xl mx-auto px-4 py-4">
      <router-view />
    </main>

    <AppFooter :class="auth.isAuthenticated ? 'pb-20' : ''" />

    <BottomNav v-if="auth.isAuthenticated" />
  </div>
  <ToastContainer />
</template>
