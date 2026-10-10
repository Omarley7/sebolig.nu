<script setup lang="ts">
import { imageUrl } from "~/lib/imageUrl";
import type { WaitingList } from "@/types";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useSheet } from "~/composables/useSheet";
import { formatCurrency } from "~/lib/formatters";
import { useWaitingListsStore } from "~/stores/waitingLists";
import BottomSheet from "~/components/shared/BottomSheet.vue";
import DetailGallery from "~/components/shared/DetailGallery.vue";
import ConfirmUnsubscribeDialog from "./ConfirmUnsubscribeDialog.vue";

const { t } = useI18n();
const store = useWaitingListsStore();

const props = defineProps<{
  list: WaitingList;
}>();

const emit = defineEmits<{
  close: [];
  "after-leave": [];
}>();

const sheet = useSheet();
const confirmUnsubscribe = sheet.popup({ escapable: () => !store.isMutating });

const allImages = computed(() => props.list.images ?? []);

const appliedSinceFormatted = computed(() => {
  if (!props.list.appliedSince) return null;
  return new Date(props.list.appliedSince).toLocaleDateString("da-DK", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
});

const orgLogoUrl = computed(() =>
  props.list.organization.logoUrl ? imageUrl(props.list.organization.logoUrl) : null,
);

function handleMapClick() {
  window.open(
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(props.list.address)}`,
    "_blank",
  );
}

function openOnFindbolig() {
  window.open(
    `https://findbolig.nu/property/${props.list.propertyShortId}`,
    "_blank",
  );
}

async function handleReactivate() {
  await store.setActive(props.list.propertyId);
}

async function handleConfirmUnsubscribe() {
  const ok = await store.unsubscribe(props.list.propertyId);
  // Closing the sheet also closes the confirm dialog on top of it
  if (ok) sheet.close();
}
</script>

<template>
  <BottomSheet :sheet="sheet" @close="emit('close')" @after-leave="emit('after-leave')">
    <DetailGallery :sheet="sheet" :images="allImages" :blueprints="list.blueprints" />

    <!-- Content -->
    <div class="p-5 space-y-5">
      <!-- Header -->
      <div>
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <h2 class="text-lg font-bold text-neutral-900 dark:text-white leading-snug">
              {{ list.name }}
            </h2>
            <button class="flex items-center gap-1.5 mt-1.5 group" @click="handleMapClick">
              <p class="text-sm text-neutral-500 dark:text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-300 transition-colors">
                {{ list.address }}
              </p>
              <img src="/icons/map.svg" alt="" class="size-4 opacity-40 group-hover:opacity-70 transition-opacity dark:invert" />
            </button>
          </div>
          <div
            v-if="orgLogoUrl"
            class="shrink-0 inline-flex items-center justify-center h-5 px-1 rounded bg-white"
          >
            <img
              :src="orgLogoUrl"
              :alt="list.organization.name"
              class="block h-full w-auto object-contain"
            />
          </div>
        </div>
        <p class="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
          {{ list.organization.name }} · {{ list.company.name }}
        </p>
      </div>

      <hr class="border-neutral-200 dark:border-neutral-700/50" />

      <!-- Stats grid -->
      <div class="grid grid-cols-2 gap-4">
        <div>
          <p class="text-xs font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-1">
            {{ t("waitingLists.card.bestPosition") }}
          </p>
          <p
            class="text-2xl font-bold tabular-nums"
            :class="list.bestPosition != null ? 'text-neutral-800 dark:text-neutral-200' : 'text-neutral-300 dark:text-neutral-600'"
          >
            {{ list.bestPosition != null ? `#${list.bestPosition}` : t("waitingLists.card.noPosition") }}
          </p>
        </div>
        <div>
          <p class="text-xs font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-1">
            {{ t("waitingLists.card.residencesApplied", { count: list.residencesAppliedCount }) }}
          </p>
          <p class="text-sm text-neutral-500 dark:text-neutral-400">
            {{ t("waitingLists.detail.rooms", { min: list.minRooms, max: list.maxRooms }) }}
            · {{ t("waitingLists.detail.area", { min: list.minArea, max: list.maxArea }) }}
          </p>
        </div>
      </div>

      <!-- Rent -->
      <div class="p-3 rounded-xl bg-neutral-100 dark:bg-white/5">
        <p class="text-xs font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-0.5">
          {{ t("waitingLists.detail.rent") }}
        </p>
        <p class="text-sm font-medium tabular-nums text-neutral-800 dark:text-neutral-200">
          {{ t("waitingLists.card.rentRange", { min: formatCurrency(list.minRent), max: formatCurrency(list.maxRent) }) }}
        </p>
      </div>

      <!-- Applied since -->
      <div v-if="appliedSinceFormatted">
        <p class="text-xs text-neutral-500 dark:text-neutral-400">
          {{ t("waitingLists.detail.appliedSince", { date: appliedSinceFormatted }) }}
        </p>
      </div>

      <hr class="border-neutral-200 dark:border-neutral-700/50" />

      <!-- Action area -->
      <div>
        <button
          v-if="list.status === 'Passive'"
          class="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold transition-colors disabled:opacity-60"
          :disabled="store.isMutating"
          @click="handleReactivate"
        >
          {{ t("waitingLists.card.reactivate") }}
        </button>
        <div
          v-else
          class="w-full py-3.5 rounded-xl bg-emerald-500/10 text-center"
        >
          <span class="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
            &#x2713; {{ t("waitingLists.card.statusActive") }}
          </span>
        </div>
      </div>

      <!-- Open on findbolig -->
      <button
        class="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-neutral-200 dark:border-neutral-700/50 hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors"
        @click="openOnFindbolig"
      >
        <img src="/icons/external-link.svg" alt="" class="size-4 opacity-50 dark:invert" />
        <span class="text-sm font-medium text-neutral-600 dark:text-neutral-300">
          {{ t("waitingLists.detail.openOnFindbolig") }}
        </span>
      </button>

      <hr class="border-neutral-200 dark:border-neutral-700/50" />

      <!-- Danger zone -->
      <div>
        <p class="text-xs font-medium uppercase tracking-wider text-red-500/70 mb-2">
          {{ t("waitingLists.detail.dangerZone") }}
        </p>
        <button
          class="w-full py-3 px-4 rounded-xl border border-red-300/50 dark:border-red-500/30
                 text-red-600 dark:text-red-400 font-medium
                 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
          :disabled="store.isMutating"
          @click="confirmUnsubscribe.open()"
        >
          {{ t("waitingLists.detail.unsubscribe") }}
        </button>
      </div>
    </div>

    <template #popups>
      <!-- Confirm unsubscribe -->
      <ConfirmUnsubscribeDialog
        v-if="confirmUnsubscribe.isOpen"
        :name="list.name"
        :is-loading="store.isMutating"
        @confirm="handleConfirmUnsubscribe"
        @cancel="confirmUnsubscribe.close()"
      />
    </template>
  </BottomSheet>
</template>
