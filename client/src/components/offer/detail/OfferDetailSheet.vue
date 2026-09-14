<script setup lang="ts">
import type { Offer } from "@/types";
import { Navigation, Pagination } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/vue";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useScrollLock } from "~/composables/useScrollLock";
import { formatCurrency } from "~/lib/formatters";
import { getDeadlineUrgency, urgencyColors } from "~/lib/deadlineUrgency";
import { galleryImage } from "~/lib/imageTransform";
import { useOffersStore } from "~/stores/offers";
import ImageGalleryModal from "~/components/appointment/gallery/ImageGalleryModal.vue";
import FinancialsModal from "~/components/appointment/card/FinancialsModal.vue";
import ConfirmActionDialog from "./ConfirmActionDialog.vue";

const { t } = useI18n();
useScrollLock();
const store = useOffersStore();
const { getImageUrl } = store;

const props = defineProps<{
  offer: Offer;
}>();

const emit = defineEmits<{
  close: [];
  "after-leave": [];
}>();

const visible = ref(false);
const showGallery = ref(false);
const showFinancials = ref(false);
const confirmAction = ref<"accept" | "decline" | null>(null);
const galleryActiveIndex = ref(0);
const galleryTab = ref<"images" | "blueprints">("images");
const sheetEl = ref<HTMLElement | null>(null);

// Drag-to-dismiss
const dragY = ref(0);
const isDragging = ref(false);
let dragStartY = 0;
let lastPointerId = 0;
const DISMISS_THRESHOLD = 120;

const sheetStyle = computed(() => {
  if (isDragging.value && dragY.value > 0) {
    return { transform: `translateY(${dragY.value}px)`, transition: "none" };
  }
  return undefined;
});

const backdropOpacity = computed(() => {
  if (isDragging.value && dragY.value > 0) {
    return Math.max(0, 1 - dragY.value / 400);
  }
  return undefined;
});

function onDragStart(e: PointerEvent) {
  isDragging.value = true;
  dragStartY = e.clientY;
  dragY.value = 0;
  lastPointerId = e.pointerId;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onDragMove(e: PointerEvent) {
  if (!isDragging.value) return;
  const delta = e.clientY - dragStartY;
  dragY.value = Math.max(0, delta);
}

function onDragEnd(e: PointerEvent) {
  if (!isDragging.value) return;
  isDragging.value = false;
  (e.currentTarget as HTMLElement).releasePointerCapture(lastPointerId);
  if (dragY.value > DISMISS_THRESHOLD) {
    close();
  } else {
    dragY.value = 0;
  }
}

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

// Gallery click vs swipe
let galleryStartX = 0;
let galleryStartY = 0;

function onGalleryPointerDown(e: PointerEvent) {
  galleryStartX = e.clientX;
  galleryStartY = e.clientY;
}

function openGallery(e: MouseEvent) {
  if (Math.abs(e.clientX - galleryStartX) > 5 || Math.abs(e.clientY - galleryStartY) > 5) return;
  galleryTab.value = "images";
  showGallery.value = true;
  history.pushState({ sheet: true, gallery: true }, "");
}

function openBlueprints() {
  galleryTab.value = "blueprints";
  showGallery.value = true;
  history.pushState({ sheet: true, gallery: true }, "");
}

function openFinancials() {
  showFinancials.value = true;
  history.pushState({ sheet: true, financials: true }, "");
}

function onGalleryClose() {
  showGallery.value = false;
  history.back();
}

function onFinancialsClose() {
  showFinancials.value = false;
  history.back();
}

function handleMapClick() {
  const address = `${props.offer.residence.adressLine1}, ${props.offer.residence.adressLine2}`;
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
}

async function handleConfirm() {
  if (!confirmAction.value) return;
  const success = confirmAction.value === "accept"
    ? await store.acceptOffer(props.offer.id)
    : await store.declineOffer(props.offer.id);

  if (success) {
    confirmAction.value = null;
  }
}

let closedViaPopState = false;

function close() {
  if (!visible.value) return;
  visible.value = false;

  if (!closedViaPopState) {
    window.removeEventListener("popstate", onPopState);
    history.back();
  }

  emit("close");

  let fired = false;
  const emitAfterLeave = () => {
    if (!fired) {
      fired = true;
      emit("after-leave");
    }
  };
  sheetEl.value?.addEventListener("transitionend", emitAfterLeave, { once: true });
  setTimeout(emitAfterLeave, 350);
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && !showGallery.value && !showFinancials.value && !confirmAction.value) close();
}

function onPopState(event: PopStateEvent) {
  if (showGallery.value) { showGallery.value = false; return; }
  if (showFinancials.value) { showFinancials.value = false; return; }
  if (event.state?.sheet) return;
  closedViaPopState = true;
  close();
}

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
  window.addEventListener("popstate", onPopState);
  history.pushState({ sheet: true }, "");
  requestAnimationFrame(() => { visible.value = true; });
});

onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown);
  window.removeEventListener("popstate", onPopState);
});
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-end justify-center" :class="{ 'pointer-events-none': !visible }">
      <!-- Backdrop -->
      <div
        class="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
        :class="visible ? 'opacity-100' : 'opacity-0'"
        :style="backdropOpacity != null ? { opacity: backdropOpacity } : undefined"
        @click="close"
      />

      <!-- Sheet -->
      <div
        ref="sheetEl"
        role="dialog"
        aria-modal="true"
        class="sheet-panel relative w-full max-w-2xl max-h-[92vh]
               bg-white dark:bg-neutral-900
               rounded-t-2xl overflow-hidden
               flex flex-col shadow-2xl
               transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
        :class="visible ? 'translate-y-0' : 'translate-y-full'"
        :style="sheetStyle"
      >
        <!-- Drag handle -->
        <div
          class="flex justify-center pt-3 pb-3 shrink-0 cursor-grab active:cursor-grabbing touch-none select-none"
          @pointerdown="onDragStart"
          @pointermove="onDragMove"
          @pointerup="onDragEnd"
          @pointercancel="onDragEnd"
        >
          <div class="w-10 h-1 rounded-full bg-neutral-300 dark:bg-neutral-600" />
        </div>

        <!-- Close button -->
        <button
          class="absolute top-3 right-3 z-10 p-1.5 rounded-full
                 bg-black/20 hover:bg-black/30 dark:bg-white/10 dark:hover:bg-white/20
                 transition-colors"
          aria-label="Close"
          @click="close"
        >
          <img src="/icons/x.svg" alt="" class="size-4 invert" />
        </button>

        <!-- Scrollable content -->
        <div class="overflow-y-auto overscroll-contain flex-1">
          <!-- Image gallery -->
          <div v-if="allImages.length > 0" class="relative cursor-pointer" @pointerdown="onGalleryPointerDown" @click="openGallery">
            <Swiper
              :modules="[Navigation, Pagination]"
              :slides-per-view="1"
              :space-between="0"
              :pagination="{ clickable: true, dynamicBullets: true }"
              :navigation="allImages.length > 1"
              class="detail-swiper"
              @slide-change="(s: any) => galleryActiveIndex = s.activeIndex"
            >
              <SwiperSlide v-for="(img, i) in allImages" :key="img">
                <img
                  :src="galleryImage(getImageUrl(img))"
                  :alt="`Photo ${i + 1}`"
                  class="w-full aspect-[16/10] object-cover"
                  :loading="i > 0 ? 'lazy' : 'eager'"
                />
              </SwiperSlide>
            </Swiper>

            <!-- Blueprint shortcut -->
            <button
              v-if="blueprints.length > 0"
              class="absolute bottom-3 left-3 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-full
                     bg-black/40 hover:bg-black/60 backdrop-blur-sm text-white text-xs font-medium tabular-nums
                     transition-colors"
              @pointerdown.stop
              @click.stop="openBlueprints"
            >
              <img src="/icons/blueprint.svg" alt="" class="size-3.5 invert" />
              {{ t("gallery.blueprintCount", { count: blueprints.length }).toLowerCase() }}
            </button>

            <div
              v-if="allImages.length > 1"
              class="absolute bottom-3 right-3 z-10 px-2.5 py-1 rounded-full
                     bg-black/40 backdrop-blur-sm text-white text-xs tabular-nums pointer-events-none"
            >
              {{ t("gallery.photoCount", { count: allImages.length }).toLowerCase() }}
            </div>
          </div>

          <!-- Content -->
          <div class="p-5 space-y-5">
            <!-- Address -->
            <div>
              <h2 class="text-lg font-bold text-neutral-900 dark:text-white leading-snug">
                {{ offer.residence.adressLine1 }}
              </h2>
              <p v-if="facts" class="text-sm font-medium text-neutral-700 dark:text-neutral-300 mt-0.5 tabular-nums">
                {{ facts }}
              </p>
              <button class="flex items-center gap-1.5 mt-1.5 group" @click="handleMapClick">
                <p class="text-sm text-neutral-500 dark:text-neutral-400
                           group-hover:text-neutral-700 dark:group-hover:text-neutral-300 transition-colors">
                  {{ offer.residence.adressLine2 }}
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
              @click="openFinancials"
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
        </div>
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
      </div>
    </div>

    <!-- Gallery modal -->
    <ImageGalleryModal
      v-if="showGallery"
      :images="allImages"
      :blueprints="blueprints"
      :initial-index="galleryActiveIndex"
      :initial-tab="galleryTab"
      :get-image-url="getImageUrl"
      @close="onGalleryClose"
    />

    <!-- Financials modal -->
    <FinancialsModal
      v-if="showFinancials"
      :financials="offer.financials"
      @close="onFinancialsClose"
    />

    <!-- Confirm action dialog -->
    <ConfirmActionDialog
      v-if="confirmAction"
      :action="confirmAction"
      :address="`${offer.residence.adressLine1}, ${offer.residence.adressLine2}`"
      :is-loading="store.isActioning"
      @confirm="handleConfirm"
      @cancel="confirmAction = null"
    />
  </Teleport>
</template>

<style scoped>
.action-footer {
  padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
}
.detail-swiper :deep(.swiper-pagination-bullet) {
  background: white;
  opacity: 0.5;
}
.detail-swiper :deep(.swiper-pagination-bullet-active) {
  opacity: 1;
}
.detail-swiper :deep(.swiper-button-next),
.detail-swiper :deep(.swiper-button-prev) {
  color: rgba(255, 255, 255, 0.7);
  --swiper-navigation-size: 18px;
}
.detail-swiper :deep(.swiper-button-next:hover),
.detail-swiper :deep(.swiper-button-prev:hover) {
  color: white;
}
@media (max-width: 639px) {
  .detail-swiper :deep(.swiper-button-next),
  .detail-swiper :deep(.swiper-button-prev) {
    display: none;
  }
}
</style>
