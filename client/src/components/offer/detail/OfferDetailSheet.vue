<script setup lang="ts">
import type { Offer } from "@/types";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useSheet } from "~/composables/useSheet";
import { formatCurrency } from "~/lib/formatters";
import { getDeadlineUrgency, urgencyColors } from "~/lib/deadlineUrgency";
import { useOffersStore } from "~/stores/offers";
import FinancialsModal from "~/components/shared/FinancialsModal.vue";
import BottomSheet from "~/components/shared/BottomSheet.vue";
import DetailGallery from "~/components/shared/DetailGallery.vue";
import ConfirmActionDialog from "./ConfirmActionDialog.vue";

const { t } = useI18n();
const store = useOffersStore();

const props = defineProps<{
  offer: Offer;
}>();

const emit = defineEmits<{
  close: [];
  "after-leave": [];
}>();

const sheet = useSheet();
const financials = sheet.popup();
const confirm = sheet.popup({ escapable: () => !store.isActioning });
const confirmAction = ref<"accept" | "decline">("accept");

const allImages = computed(() => {
  if (props.offer.images?.length) return props.offer.images;
  return props.offer.imageUrl ? [props.offer.imageUrl] : [];
});

const blueprints = computed(() => props.offer.blueprints ?? []);

const facts = computed(() => {
  const parts: string[] = [];
  if (props.offer.rooms != null) parts.push(t("offers.rooms", { count: props.offer.rooms }));
  if (props.offer.area != null) parts.push(t("offers.area", { value: props.offer.area }));
  return parts.join(" · ");
});

const urgency = computed(() => getDeadlineUrgency(props.offer.deadline, t));

const availableFromFormatted = computed(() => {
  if (!props.offer.availableFrom) return null;
  return new Date(props.offer.availableFrom).toLocaleDateString("da-DK", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
});

function handleMapClick() {
  const address = `${props.offer.residence.addressLine1}, ${props.offer.residence.addressLine2}`;
  window.open(
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
    "_blank",
  );
}

function openOnFindbolig() {
  window.open(
    `https://findbolig.nu/profile/my-offers?offerId=${props.offer.id}`,
    "_blank",
  );
}

function promptAction(action: "accept" | "decline") {
  confirmAction.value = action;
  confirm.open();
}

async function handleConfirm() {
  const success = confirmAction.value === "accept"
    ? await store.acceptOffer(props.offer.id)
    : await store.declineOffer(props.offer.id);

  if (success) confirm.close();
}
</script>

<template>
  <BottomSheet :sheet="sheet" @close="emit('close')" @after-leave="emit('after-leave')">
    <DetailGallery :sheet="sheet" :images="allImages" :blueprints="blueprints" />

    <!-- Content -->
    <div class="p-5 space-y-5">
      <!-- Address -->
      <div>
        <h2 class="text-lg font-bold text-neutral-900 dark:text-white leading-snug">
          {{ offer.residence.addressLine1 }}
        </h2>
        <p v-if="facts" class="text-sm font-medium text-neutral-700 dark:text-neutral-300 mt-0.5 tabular-nums">
          {{ facts }}
        </p>
        <button class="flex items-center gap-1.5 mt-1.5 group" @click="handleMapClick">
          <p class="text-sm text-neutral-500 dark:text-neutral-400
                     group-hover:text-neutral-700 dark:group-hover:text-neutral-300 transition-colors">
            {{ offer.residence.addressLine2 }}
          </p>
          <img src="/icons/map.svg" alt="" class="size-4 opacity-40 group-hover:opacity-70 transition-opacity dark:invert" />
        </button>
        <p v-if="offer.company" class="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
          {{ offer.company }}
        </p>
      </div>

      <hr class="border-neutral-200 dark:border-neutral-700/50" />

      <!-- Deadline + Queue -->
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-xs font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-1">
            {{ t("offers.deadline") }}
          </p>
          <div class="flex items-center gap-1.5">
            <span class="inline-block w-2 h-2 rounded-full" :class="urgencyColors[urgency.color].dot" />
            <p class="text-sm font-medium" :class="urgencyColors[urgency.color].text">
              {{ offer.deadline ? new Date(offer.deadline).toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" }) : t("offers.noDeadline") }}
            </p>
          </div>
          <p class="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">
            {{ urgency.relative }}
          </p>
        </div>

        <div v-if="offer.position != null" class="text-right shrink-0">
          <p class="text-xs font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-1">
            {{ t("offers.queuePosition") }}
          </p>
          <p class="text-2xl font-bold tabular-nums text-neutral-800 dark:text-neutral-200">
            #{{ offer.position }}
          </p>
        </div>
      </div>

      <!-- Available from -->
      <div v-if="availableFromFormatted">
        <p class="text-xs font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-1">
          {{ t("offers.availableFrom") }}
        </p>
        <p class="text-sm font-medium text-neutral-800 dark:text-neutral-200">
          {{ availableFromFormatted }}
        </p>
      </div>

      <hr class="border-neutral-200 dark:border-neutral-700/50" />

      <!-- Financials summary -->
      <button
        class="w-full flex items-center justify-between p-3 rounded-xl
               bg-neutral-100 dark:bg-white/5
               hover:bg-neutral-200/70 dark:hover:bg-white/8
               transition-colors text-left"
        @click="financials.open()"
      >
        <div>
          <p class="text-xs font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-0.5">
            {{ t("financials.rent") }}
          </p>
          <p class="text-base font-semibold tabular-nums text-neutral-800 dark:text-neutral-100">
            {{ formatCurrency(offer.financials.monthlyRentIncludingAconto) }} / {{ t("financials.shortMonth") }}
          </p>
        </div>
        <div class="text-right">
          <p class="text-xs text-neutral-400 dark:text-neutral-500 mb-0.5">
            {{ t("financials.firstPayment") }}
          </p>
          <p class="text-sm font-medium tabular-nums text-neutral-700 dark:text-neutral-200">
            {{ formatCurrency(offer.financials.firstPayment) }}
          </p>
        </div>
        <img src="/icons/chevron-down.svg" alt="" class="size-4 -rotate-90 opacity-30 dark:invert shrink-0 ml-2" />
      </button>

      <!-- Open on findbolig -->
      <button
        class="w-full flex items-center justify-center gap-2 p-3 rounded-xl
               border border-neutral-200 dark:border-neutral-700/50
               hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors"
        @click="openOnFindbolig"
      >
        <img src="/icons/external-link.svg" alt="" class="size-4 opacity-50 dark:invert" />
        <span class="text-sm font-medium text-neutral-600 dark:text-neutral-300">
          {{ t("offers.openOnFindbolig") }}
        </span>
      </button>
    </div>

    <template #footer>
      <!-- Sticky action footer — always visible without scrolling -->
      <div
        class="shrink-0 px-5 pt-3 action-footer
               border-t border-neutral-200 dark:border-neutral-700/50
               bg-white dark:bg-neutral-900"
      >
        <p
          v-if="offer.recipientState === 'OfferReceived'"
          class="text-xs text-center text-neutral-500 dark:text-neutral-400 mb-2.5"
        >
          {{ t("offers.respondBefore") }}
        </p>

        <!-- OfferReceived: Accept + Decline -->
        <div v-if="offer.recipientState === 'OfferReceived'" class="flex gap-3">
          <button
            class="flex-1 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold transition-colors"
            @click="promptAction('accept')"
          >
            {{ t("offers.accept") }}
          </button>
          <button
            class="flex-1 py-3.5 rounded-xl border border-neutral-200 dark:border-neutral-700/50
                   text-neutral-500 dark:text-neutral-400 font-semibold
                   hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors"
            @click="promptAction('decline')"
          >
            {{ t("offers.decline") }}
          </button>
        </div>

        <!-- OfferAccepted: Undo (decline) -->
        <div v-else-if="offer.recipientState === 'OfferAccepted'" class="flex gap-3">
          <button
            class="flex-1 py-3.5 rounded-xl border border-amber-400/50
                   text-amber-600 dark:text-amber-400 font-semibold
                   hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors"
            @click="promptAction('decline')"
          >
            {{ t("offers.undoAccept") }}
          </button>
          <div class="flex-1 py-3.5 rounded-xl bg-emerald-500/10 text-center">
            <span class="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
              &#x2713; {{ t("offers.accepted") }}
            </span>
          </div>
        </div>

        <!-- OfferDeclined: Accept again -->
        <div v-else-if="offer.recipientState === 'OfferDeclined'" class="flex gap-3">
          <button
            class="flex-1 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold transition-colors"
            @click="promptAction('accept')"
          >
            {{ t("offers.accept") }}
          </button>
          <div class="flex-1 py-3.5 rounded-xl bg-neutral-100 dark:bg-white/5 text-center">
            <span class="text-sm text-neutral-400 dark:text-neutral-500 font-medium">
              {{ t("offers.declined") }}
            </span>
          </div>
        </div>
      </div>
    </template>

    <template #popups>
      <!-- Financials modal -->
      <FinancialsModal
        v-if="financials.isOpen"
        :financials="offer.financials"
        @close="financials.close()"
      />

      <!-- Confirm action dialog -->
      <ConfirmActionDialog
        v-if="confirm.isOpen"
        :action="confirmAction"
        :address="`${offer.residence.addressLine1}, ${offer.residence.addressLine2}`"
        :is-loading="store.isActioning"
        @confirm="handleConfirm"
        @cancel="confirm.close()"
      />
    </template>
  </BottomSheet>
</template>

<style scoped>
.action-footer {
  padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
}
</style>
