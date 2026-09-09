<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import LandingSection from "~/components/LandingSection.vue";
import { useAuth } from "~/composables/useAuth";
import { getCacheAge } from "~/data/appointments";
import { getOffersCacheAge } from "~/data/offers";
import { getWaitingListsCacheAge } from "~/data/waitingLists";
import { useAppointmentsStore } from "~/stores/appointments";
import { useOffersStore } from "~/stores/offers";
import { useWaitingListsStore } from "~/stores/waitingLists";

const auth = useAuth();
const store = useAppointmentsStore();
const offersStore = useOffersStore();
const waitingListsStore = useWaitingListsStore();
const { t } = useI18n();

const hasCache = computed(() => getCacheAge() !== null);
// Re-read the cache when the Connection flips: an ending erases it, and the user should then
// see the connect form (with its explanation) even if they were already on this page. Relies on
// eraseLocalData() clearing the caches before it flips isAuthenticated.
const showLanding = computed(() => !auth.isAuthenticated && getCacheAge() === null);
const hasOffersCache = computed(() => getOffersCacheAge() !== null);
const hasWaitingListsCache = computed(() => getWaitingListsCacheAge() !== null);

onMounted(() => {
  if (auth.isAuthenticated || hasCache.value) store.init();
  if (auth.isAuthenticated || hasOffersCache.value) offersStore.init();
  if (auth.isAuthenticated || hasWaitingListsCache.value) waitingListsStore.init();
});

const hasAppointments = computed(() => store.appointments.length > 0);
const offerCount = computed(() => offersStore.offers.length);
const waitingListsCount = computed(() => waitingListsStore.lists.length);
const firstName = computed(() => auth.name?.split(" ")[0] || "");

const lastUpdatedText = computed(() => {
  const age = getCacheAge();
  if (age === null) return null;
  const hours = Math.floor(age / (1000 * 60 * 60));
  const minutes = Math.floor((age % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return t("home.lastUpdated", [`${hours}h ${minutes}m`]);
  return t("home.lastUpdated", [`${minutes}m`]);
});
</script>

<template>
  <!-- Unauthenticated with no cache: landing page -->
  <LandingSection v-if="showLanding" />

  <!-- First-time user: no cached appointments -->
  <div
    v-else-if="!hasAppointments"
    class="flex flex-col items-center justify-center gap-6 py-12 px-4 max-w-md mx-auto text-center"
  >
    <div
      class="w-full bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800/50 rounded-lg shadow-lg p-8 flex flex-col items-center gap-5"
    >
      <img src="/icons/cloud-download.svg" alt="" class="size-12 dark:invert opacity-70" />
      <h2 class="text-2xl font-bold">{{ t("home.welcomeUser", [firstName]) }}</h2>
      <p class="text-gray-600 dark:text-gray-300">{{ t("home.readyToFetch") }}</p>
      <div class="flex flex-col gap-3 w-full">
        <router-link
          to="/appointments"
          class="px-6 py-3 bg-blue-600 text-white! rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          {{ t("home.fetchAppointments") }}
        </router-link>
        <router-link
          to="/offers"
          class="px-6 py-3 border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors font-medium"
        >
          {{ t("home.viewOffers") }}
        </router-link>
      </div>
      <p class="text-xs text-gray-400 dark:text-gray-500">{{ t("home.noAppointmentsHint") }}</p>
    </div>
  </div>

  <!-- Returning user: has cached data -->
  <div
    v-else
    class="flex flex-col items-center justify-center gap-4 py-12 px-4 max-w-md mx-auto text-center"
  >
    <h2 class="text-2xl font-bold">
      {{ firstName ? t("home.welcomeBack", [firstName]) : t("home.welcomeBackAnonymous") }}
    </h2>
    <p v-if="lastUpdatedText" class="text-sm text-gray-500 dark:text-gray-400">
      {{ lastUpdatedText }}
    </p>

    <div class="w-full space-y-3 mt-2">
      <!-- Appointments card -->
      <router-link
        to="/appointments"
        class="w-full flex items-center gap-4 p-4 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-neutral-700/50 hover:bg-neutral-200/70 dark:hover:bg-white/8 transition-colors text-left"
      >
        <img src="/icons/calendar-days.svg" alt="" class="size-8 dark:invert opacity-60 shrink-0" />
        <div class="min-w-0 flex-1">
          <p class="font-semibold text-neutral-800 dark:text-neutral-100">{{ t("nav.appointments") }}</p>
          <p class="text-sm text-neutral-500 dark:text-neutral-400">
            {{ t("home.viewAppointments", [store.appointments.length]) }}
          </p>
        </div>
        <img
          src="/icons/chevron-down.svg"
          alt=""
          class="size-5 -rotate-90 opacity-30 dark:invert shrink-0"
        />
      </router-link>

      <!-- Offers card -->
      <router-link
        to="/offers"
        class="w-full flex items-center gap-4 p-4 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-neutral-700/50 hover:bg-neutral-200/70 dark:hover:bg-white/8 transition-colors text-left"
      >
        <img src="/icons/cloud-download.svg" alt="" class="size-8 dark:invert opacity-60 shrink-0" />
        <div class="min-w-0 flex-1">
          <p class="font-semibold text-neutral-800 dark:text-neutral-100">{{ t("nav.offers") }}</p>
          <p class="text-sm text-neutral-500 dark:text-neutral-400">
            {{ offerCount > 0 ? t("home.viewOffers", [offerCount]) : t("home.checkOffers") }}
          </p>
        </div>
        <img
          src="/icons/chevron-down.svg"
          alt=""
          class="size-5 -rotate-90 opacity-30 dark:invert shrink-0"
        />
      </router-link>

      <!-- Waiting lists card -->
      <router-link
        to="/waiting-lists"
        class="w-full flex items-center gap-4 p-4 rounded-xl bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-neutral-700/50 hover:bg-neutral-200/70 dark:hover:bg-white/8 transition-colors text-left relative"
      >
        <img src="/icons/list.svg" alt="" class="size-8 dark:invert opacity-60 shrink-0" />
        <div class="min-w-0 flex-1">
          <p class="font-semibold text-neutral-800 dark:text-neutral-100 flex items-center gap-2">
            {{ t("nav.waitingLists") }}
            <span
              v-if="waitingListsStore.recentlyPassivated.length > 0"
              class="inline-flex items-center justify-center min-w-4 h-4 px-1 text-[0.625rem] font-bold rounded-full bg-red-500 text-white"
            >
              {{ waitingListsStore.recentlyPassivated.length }}
            </span>
          </p>
          <p class="text-sm text-neutral-500 dark:text-neutral-400">
            {{ waitingListsCount > 0 ? t("home.viewWaitingLists", [waitingListsCount]) : t("home.checkWaitingLists") }}
          </p>
        </div>
        <img
          src="/icons/chevron-down.svg"
          alt=""
          class="size-5 -rotate-90 opacity-30 dark:invert shrink-0"
        />
      </router-link>
    </div>
  </div>
</template>
