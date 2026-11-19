<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import ToastContainer from "~/components/Base/ToastContainer.vue";
import ConnectDialog from "~/components/ConnectDialog.vue";
import AppHeader from "~/components/layout/AppHeader.vue";
import BottomNav from "~/components/layout/BottomNav.vue";
import NavRail from "~/components/layout/NavRail.vue";
import { useAuth } from "~/composables/useAuth";
import { useIsDesktop } from "~/composables/useIsDesktop";
import { useToastStore } from "~/stores/toast";
import config from "./config";

const auth = useAuth();
const router = useRouter();
const route = useRoute();
const isDesktop = useIsDesktop();

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

// Offline, the app keeps showing what is stored, and says so.
const { t } = useI18n();
const toast = useToastStore();
const onOffline = () => toast.info(t("common.offline"));
onMounted(() => window.addEventListener("offline", onOffline));
onUnmounted(() => window.removeEventListener("offline", onOffline));

// From lg up a Connection gets the left rail; below it, the header and the bottom nav (Q14).
const withRail = computed(() => auth.isAuthenticated && isDesktop.value);
// The landing page lays itself out wider; every other page is the phone column, or the desktop page.
const wide = computed(() => !auth.isAuthenticated || route.meta.wide === true);
</script>

<template>
  <div class="min-h-dvh flex bg-bg text-ink">
    <NavRail v-if="withRail" />
    <div class="flex-1 min-w-0 flex flex-col">
      <AppHeader v-if="!withRail" />
      <main
        class="flex-1 w-full mx-auto"
        :class="[
          wide ? '' : 'max-w-2xl px-4 lg:max-w-none lg:px-8',
          auth.isAuthenticated && !withRail ? 'pb-[calc(84px+env(safe-area-inset-bottom,0px))]' : 'pb-8',
        ]"
      >
        <router-view />
      </main>
    </div>
    <BottomNav v-if="auth.isAuthenticated && !withRail" />
  </div>
  <ConnectDialog v-if="auth.showConnectModal" />
  <ToastContainer :above-nav="auth.isAuthenticated && !withRail" />
</template>
