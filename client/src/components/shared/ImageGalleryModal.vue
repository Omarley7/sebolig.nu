<script setup lang="ts">
import { Keyboard, Navigation, Pagination, Zoom } from "swiper/modules";
import type { Swiper as SwiperClass } from "swiper/types";
import { Swiper, SwiperSlide } from "swiper/vue";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { blueprintImage, galleryImage } from "~/lib/imageTransform";
import { useScrollLock } from "~/composables/useScrollLock";

import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";

useScrollLock();

type Tab = "images" | "blueprints";

const props = defineProps<{
  images: string[];
  blueprints?: string[];
  initialIndex?: number;
  initialTab?: Tab;
  getImageUrl: (path: string) => string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const activeTab = ref<Tab>(
  props.initialTab === "blueprints" && props.blueprints?.length ? "blueprints" : "images",
);

const activeList = computed(() =>
  activeTab.value === "images" ? props.images : (props.blueprints ?? []),
);

const hasBlueprints = computed(() => props.blueprints && props.blueprints.length > 0);

const swiperInstance = ref<SwiperClass | null>(null);

function onSwiperInit(swiper: SwiperClass) {
  swiperInstance.value = swiper;
}

function switchTab(tab: Tab) {
  activeTab.value = tab;
}

// Reset to first slide on tab switch
watch(activeTab, () => {
  if (swiperInstance.value) {
    swiperInstance.value.slideTo(0, 0);
  }
});

// Reset tab when images prop changes (different appointment)
watch(
  () => props.images,
  () => {
    activeTab.value = "images";
  },
);

function resolveUrl(path: string): string {
  const transform = activeTab.value === "blueprints" ? blueprintImage : galleryImage;
  return transform(props.getImageUrl(path));
}

// Escape to close — arrow keys handled by Swiper Keyboard module
function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
}

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
});
onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm overscroll-contain"
      @click.self="emit('close')">
      <!-- Close -->
      <button
        class="absolute top-4 right-4 z-20 p-2 rounded-full! bg-white/10! hover:bg-white/20! border-none! transition-colors duration-200"
        aria-label="Close gallery" @click="emit('close')">
        <img src="/icons/x.svg" alt="Close" class="size-5 invert" />
      </button>

      <!-- Tabs -->
      <div v-if="hasBlueprints" class="flex gap-1 mb-4 z-10">
        <button v-for="tab in (['images', 'blueprints'] as Tab[])" :key="tab"
          class="px-5 py-1.5 rounded-full! text-sm font-medium tracking-wide transition-all duration-200 border-none!"
          :class="activeTab === tab
              ? 'bg-white/15! text-white shadow-sm'
              : 'bg-transparent! text-white/50 hover:text-white/80 hover:bg-white/5!'
            " @click="switchTab(tab)">
          {{ tab === "images" ? $t("gallery.photos") : $t("gallery.blueprints") }}
        </button>
      </div>

      <!-- Swiper -->
      <div class="relative w-full max-w-5xl px-4 sm:px-12">
        <Swiper :key="activeTab" :modules="[Zoom, Navigation, Keyboard, Pagination]" :navigation="true"
          :keyboard="{ enabled: true }" :pagination="{ type: 'fraction' }" :slides-per-view="1" :space-between="0"
          :lazy-preload-prev-next="1" :grab-cursor="true" :zoom="true"
          :initial-slide="activeTab === 'images' ? (props.initialIndex ?? 0) : 0"
          class="gallery-swiper" @swiper="onSwiperInit">
          <SwiperSlide v-for="(path, index) in activeList" :key="path" class="!flex items-center justify-center">
            <div class="swiper-zoom-container">
              <img :src="resolveUrl(path)" :loading="index <= 1 ? 'eager' : 'lazy'"
                :alt="`${activeTab === 'images' ? 'Photo' : 'Blueprint'} ${index + 1}`"
                class="max-h-[75vh] max-w-full object-contain rounded-lg" />
            </div>
            <div v-if="index > 1" class="swiper-lazy-preloader swiper-lazy-preloader-white" />
          </SwiperSlide>
        </Swiper>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Navigation arrows */
.gallery-swiper :deep(.swiper-button-next),
.gallery-swiper :deep(.swiper-button-prev) {
  color: rgba(255, 255, 255, 0.7);
  transition:
    color 0.2s ease,
    opacity 0.2s ease;
  --swiper-navigation-size: 22px;
}

.gallery-swiper :deep(.swiper-button-next:hover),
.gallery-swiper :deep(.swiper-button-prev:hover) {
  color: rgba(255, 255, 255, 1);
}

.gallery-swiper :deep(.swiper-button-disabled) {
  opacity: 0.15 !important;
}

/* Hide arrows on mobile — swipe is primary */
@media (max-width: 639px) {

  .gallery-swiper :deep(.swiper-button-next),
  .gallery-swiper :deep(.swiper-button-prev) {
    display: none;
  }
}

/* Fraction counter */
.gallery-swiper :deep(.swiper-pagination-fraction) {
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.8125rem;
  font-weight: 400;
  letter-spacing: 0.05em;
  bottom: auto;
  position: relative;
  margin-top: 0.75rem;
}

/* Preloader */
.gallery-swiper :deep(.swiper-lazy-preloader) {
  --swiper-preloader-color: rgba(255, 255, 255, 0.4);
}
</style>
