<script setup lang="ts">
import { ChevronLeft, ChevronRight, X } from "lucide-vue-next";
import { Keyboard, Zoom } from "swiper/modules";
import type { Swiper as SwiperClass } from "swiper/types";
import { Swiper, SwiperSlide } from "swiper/vue";
import { computed, ref, watch } from "vue";
import { blueprintImage, compactThumb, galleryImage } from "~/lib/imageTransform";
import { useScrollLock } from "~/composables/useScrollLock";

import "swiper/css";

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

// The slide shown: the one tapped on the hero, or the first of the floor plans
const startIndex = computed(() => (activeTab.value === "images" ? (props.initialIndex ?? 0) : 0));
const current = ref(startIndex.value);

// Back to the first slide on a tab switch (the swiper is keyed by tab, so it starts over)
watch(activeTab, () => {
  current.value = 0;
});

// Reset tab when images prop changes (a different residence)
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

function thumbUrl(path: string): string {
  return compactThumb(props.getImageUrl(path));
}

// Esc and back are handled by the sheet that opened the gallery; arrow keys by Swiper's Keyboard module
</script>

<template>
  <Teleport to="body">
    <!-- Always dark, in both themes. Floor plans on a light background. -->
    <div
      role="dialog"
      aria-modal="true"
      :aria-label="activeTab === 'images' ? $t('gallery.photos') : $t('gallery.blueprints')"
      class="fixed inset-0 z-[70] flex flex-col bg-[#0C1019] text-[#ECEEF3] overscroll-contain"
    >
      <div class="flex items-center justify-between gap-2 px-3 pt-[max(12px,env(safe-area-inset-top))] pb-2">
        <div v-if="hasBlueprints" role="tablist" class="flex gap-1 p-1 rounded-full bg-white/10">
          <button
            v-for="tab in (['images', 'blueprints'] as Tab[])"
            :key="tab"
            type="button"
            role="tab"
            :aria-selected="activeTab === tab"
            class="min-h-11 px-3.5 rounded-full text-[13px] font-semibold"
            :class="activeTab === tab ? 'bg-[#ECEEF3] text-[#141A26]' : 'text-[#ECEEF3]'"
            @click="switchTab(tab)"
          >
            {{ tab === "images" ? $t("gallery.photos") : $t("gallery.blueprints") }} · {{ tab === "images" ? images.length : blueprints!.length }}
          </button>
        </div>
        <span v-else />
        <button
          type="button"
          class="size-11 rounded-full bg-white/15 text-white flex items-center justify-center"
          :aria-label="$t('gallery.close')"
          @click="emit('close')"
        >
          <X class="size-5" aria-hidden="true" />
        </button>
      </div>

      <div class="relative flex-1 min-h-0 flex items-center">
        <Swiper
          :key="activeTab"
          :modules="[Zoom, Keyboard]"
          :keyboard="{ enabled: true }"
          :slides-per-view="1"
          :space-between="0"
          :lazy-preload-prev-next="1"
          :grab-cursor="true"
          :zoom="true"
          :initial-slide="startIndex"
          class="w-full h-full"
          @swiper="onSwiperInit"
          @slide-change="(sw: SwiperClass) => (current = sw.activeIndex)"
        >
          <SwiperSlide v-for="(path, index) in activeList" :key="path" class="!flex items-center justify-center">
            <div class="swiper-zoom-container">
              <img
                :src="resolveUrl(path)"
                :loading="index <= 1 ? 'eager' : 'lazy'"
                :alt="`${activeTab === 'images' ? $t('gallery.photos') : $t('gallery.blueprints')} ${index + 1}`"
                class="max-h-full max-w-full object-contain"
                :class="activeTab === 'blueprints' ? 'bg-white p-3 rounded-lg' : ''"
              />
            </div>
          </SwiperSlide>
        </Swiper>
        <div v-if="activeList.length > 1" class="absolute inset-x-2.5 top-1/2 -mt-[22px] z-10 flex justify-between pointer-events-none">
          <button
            type="button"
            class="pointer-events-auto size-11 rounded-full bg-white/15 text-white flex items-center justify-center disabled:opacity-30"
            :aria-label="$t('gallery.previous')"
            :disabled="current === 0"
            @click="swiperInstance?.slidePrev()"
          >
            <ChevronLeft class="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="pointer-events-auto size-11 rounded-full bg-white/15 text-white flex items-center justify-center disabled:opacity-30"
            :aria-label="$t('gallery.next')"
            :disabled="current === activeList.length - 1"
            @click="swiperInstance?.slideNext()"
          >
            <ChevronRight class="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div class="flex flex-col gap-3 px-4 pt-2 pb-[max(24px,env(safe-area-inset-bottom))]">
        <span class="self-center text-[13px] font-semibold text-[#A3A9B9] tabular-nums">{{ current + 1 }} / {{ activeList.length }}</span>
        <div class="flex gap-1.5 overflow-x-auto pb-1 lg:justify-center">
          <button
            v-for="(path, index) in activeList"
            :key="path"
            type="button"
            class="size-14 shrink-0 rounded-[10px] overflow-hidden bg-[#2E2A1F]"
            :class="index === current ? 'ring-2 ring-[#F2B441]' : 'opacity-70'"
            :aria-label="`${index + 1} / ${activeList.length}`"
            :aria-current="index === current ? 'true' : undefined"
            @click="swiperInstance?.slideTo(index)"
          >
            <img :src="thumbUrl(path)" alt="" loading="lazy" class="size-full object-cover" :class="activeTab === 'blueprints' ? 'bg-white' : ''" />
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
