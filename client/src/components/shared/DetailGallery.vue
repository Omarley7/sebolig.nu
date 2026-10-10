<script setup lang="ts">
import { Navigation, Pagination } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/vue";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import type { Sheet } from "~/composables/useSheet";
import { galleryImage } from "~/lib/imageTransform";
import { imageUrl } from "~/lib/imageUrl";
import ImageGalleryModal from "./ImageGalleryModal.vue";

const { t } = useI18n();

const props = withDefaults(
  defineProps<{
    sheet: Sheet;
    images: string[];
    blueprints?: string[];
  }>(),
  { blueprints: () => [] },
);

const gallery = props.sheet.popup();
const activeIndex = ref(0);
const tab = ref<"images" | "blueprints">("images");

// Tap vs swipe: a tap opens the full-screen gallery, a swipe only moves the carousel
let startX = 0;
let startY = 0;

function onPointerDown(e: PointerEvent) {
  startX = e.clientX;
  startY = e.clientY;
}

function openImages(e: MouseEvent) {
  if (Math.abs(e.clientX - startX) > 5 || Math.abs(e.clientY - startY) > 5) return;
  tab.value = "images";
  gallery.open();
}

function openBlueprints() {
  tab.value = "blueprints";
  gallery.open();
}
</script>

<template>
  <div v-if="images.length > 0" class="relative cursor-pointer" @pointerdown="onPointerDown" @click="openImages">
    <Swiper
      :modules="[Navigation, Pagination]"
      :slides-per-view="1"
      :space-between="0"
      :pagination="{ clickable: true, dynamicBullets: true }"
      :navigation="images.length > 1"
      class="detail-swiper"
      @slide-change="(s: any) => activeIndex = s.activeIndex"
    >
      <SwiperSlide v-for="(img, i) in images" :key="img">
        <img
          :src="galleryImage(imageUrl(img))"
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

    <!-- Photo count -->
    <div
      v-if="images.length > 1"
      class="absolute bottom-3 right-3 z-10 px-2.5 py-1 rounded-full
             bg-black/40 backdrop-blur-sm text-white text-xs tabular-nums pointer-events-none"
    >
      {{ t("gallery.photoCount", { count: images.length }).toLowerCase() }}
    </div>
  </div>

  <ImageGalleryModal
    v-if="gallery.isOpen"
    :images="images"
    :blueprints="blueprints"
    :initial-index="activeIndex"
    :initial-tab="tab"
    :get-image-url="imageUrl"
    @close="gallery.close()"
  />
</template>

<style scoped>
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
