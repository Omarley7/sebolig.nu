<script setup lang="ts">
import type { WaitingList } from "@/types";
import { Navigation, Pagination } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/vue";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useScrollLock } from "~/composables/useScrollLock";
import { formatCurrency } from "~/lib/formatters";
import { galleryImage } from "~/lib/imageTransform";
import { useWaitingListsStore } from "~/stores/waitingLists";
import ImageGalleryModal from "~/components/appointment/gallery/ImageGalleryModal.vue";
import ConfirmUnsubscribeDialog from "./ConfirmUnsubscribeDialog.vue";

const { t } = useI18n();
useScrollLock();
const store = useWaitingListsStore();
const { getImageUrl } = store;

const props = defineProps<{
  list: WaitingList;
}>();

const emit = defineEmits<{
  close: [];
  "after-leave": [];
}>();

const visible = ref(false);
const showGallery = ref(false);
const showConfirmUnsubscribe = ref(false);
const galleryActiveIndex = ref(0);
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
  props.list.organization.logoUrl ? getImageUrl(props.list.organization.logoUrl) : null,
);

// Gallery click vs swipe
let galleryStartX = 0;
let galleryStartY = 0;

function onGalleryPointerDown(e: PointerEvent) {
  galleryStartX = e.clientX;
  galleryStartY = e.clientY;
}

function openGallery(e: MouseEvent) {
  if (Math.abs(e.clientX - galleryStartX) > 5 || Math.abs(e.clientY - galleryStartY) > 5) return;
  showGallery.value = true;
  history.pushState({ sheet: true, gallery: true }, "");
}

function onGalleryClose() {
  showGallery.value = false;
  history.back();
}

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
  if (ok) {
    showConfirmUnsubscribe.value = false;
    close();
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
  if (e.key === "Escape" && !showGallery.value && !showConfirmUnsubscribe.value) close();
}

function onPopState(event: PopStateEvent) {
  if (showGallery.value) { showGallery.value = false; return; }
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
          class="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-black/20 hover:bg-black/30 dark:bg-white/10 dark:hover:bg-white/20 transition-colors"
          aria-label="Close"
          @click="close"
        >
          <img src="/icons/x.svg" alt="" class="size-4 invert" />
        </button>

        <!-- Scrollable content -->
        <div class="overflow-y-auto overscroll-contain flex-1">
          <!-- Image gallery -->
          <div
            v-if="allImages.length > 0"
            class="relative cursor-pointer"
            @pointerdown="onGalleryPointerDown"
            @click="openGallery"
          >
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

            <div
              v-if="allImages.length > 1"
              class="absolute bottom-3 right-3 z-10 px-2.5 py-1 rounded-full bg-black/40 backdrop-blur-sm text-white text-xs tabular-nums pointer-events-none"
            >
              {{ allImages.length }}
            </div>
          </div>

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
                @click="showConfirmUnsubscribe = true"
              >
                {{ t("waitingLists.detail.unsubscribe") }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Gallery modal -->
    <ImageGalleryModal
      v-if="showGallery"
      :images="allImages"
      :blueprints="list.blueprints ?? []"
      :initial-index="galleryActiveIndex"
      :get-image-url="getImageUrl"
      @close="onGalleryClose"
    />

    <!-- Confirm unsubscribe -->
    <ConfirmUnsubscribeDialog
      v-if="showConfirmUnsubscribe"
      :name="list.name"
      :is-loading="store.isMutating"
      @confirm="handleConfirmUnsubscribe"
      @cancel="showConfirmUnsubscribe = false"
    />
  </Teleport>
</template>

<style scoped>
.detail-swiper :deep(.swiper-pagination-bullet) { background: white; opacity: 0.5; }
.detail-swiper :deep(.swiper-pagination-bullet-active) { opacity: 1; }
.detail-swiper :deep(.swiper-button-next),
.detail-swiper :deep(.swiper-button-prev) {
  color: rgba(255, 255, 255, 0.7);
  --swiper-navigation-size: 18px;
}
.detail-swiper :deep(.swiper-button-next:hover),
.detail-swiper :deep(.swiper-button-prev:hover) { color: white; }
@media (max-width: 639px) {
  .detail-swiper :deep(.swiper-button-next),
  .detail-swiper :deep(.swiper-button-prev) { display: none; }
}
</style>
