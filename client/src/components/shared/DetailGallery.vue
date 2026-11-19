<script setup lang="ts">
import { FileText, Image as ImageIcon } from "lucide-vue-next";
import { Navigation } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/vue";
import "swiper/css";
import "swiper/css/navigation";
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
  if (props.images.length === 0) return;
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
  <div class="relative h-60 shrink-0 bg-soft text-soft-ink flex items-center justify-center lg:h-72">
    <ImageIcon v-if="images.length === 0" class="size-10" aria-hidden="true" />
    <div v-else class="absolute inset-0 cursor-pointer" @pointerdown="onPointerDown" @click="openImages">
      <Swiper
        :modules="[Navigation]"
        :slides-per-view="1"
        :space-between="0"
        :navigation="images.length > 1"
        class="detail-swiper h-full"
        @slide-change="(s: any) => (activeIndex = s.activeIndex)"
      >
        <SwiperSlide v-for="(img, i) in images" :key="img">
          <img
            :src="galleryImage(imageUrl(img))"
            :alt="t('gallery.photoAlt', { n: i + 1 })"
            class="size-full object-cover"
            :loading="i > 0 ? 'lazy' : 'eager'"
          />
        </SwiperSlide>
      </Swiper>
    </div>

    <div class="absolute left-3 right-3 bottom-3 z-10 flex justify-between pointer-events-none">
      <button
        v-if="blueprints.length > 0"
        type="button"
        class="pointer-events-auto h-8 px-3 rounded-full bg-white/90 text-[#141A26] text-xs font-semibold flex items-center gap-1.5"
        @pointerdown.stop
        @click.stop="openBlueprints"
      >
        <FileText class="size-3.5" aria-hidden="true" />
        {{ t("gallery.floorPlan") }}
      </button>
      <span v-else />
      <span
        v-if="images.length > 1"
        class="h-8 px-3 rounded-full bg-[rgb(20_26_38/0.72)] text-white text-xs font-semibold tabular-nums flex items-center"
      >
        {{ activeIndex + 1 }} / {{ images.length }}
      </span>
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
