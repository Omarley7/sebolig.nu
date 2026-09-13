<script setup lang="ts">
import type { Offer } from "@/types";
import { computed, nextTick, ref, watchEffect } from "vue";
import { useI18n } from "vue-i18n";
import { useOffersStore } from "~/stores/offers";
import { compactThumb, galleryImage } from "~/lib/imageTransform";
import { prefetchImages } from "~/lib/prefetch";
import { formatCurrency } from "~/lib/formatters";
import { getDeadlineUrgency, urgencyColors } from "~/lib/deadlineUrgency";
import OfferDetailSheet from "../detail/OfferDetailSheet.vue";

const { t } = useI18n();
const { getImageUrl } = useOffersStore();

const props = defineProps<{
  offer: Offer;
  loadImage?: boolean;
}>();

const showDetail = ref(false);
const detailMounted = ref(false);

function openDetail() {
  showDetail.value = true;
  detailMounted.value = true;
}

function onDetailClose() {
  showDetail.value = false;
}

async function onDetailAfterLeave() {
  if (showDetail.value) {
    detailMounted.value = false;
    await nextTick();
    detailMounted.value = true;
  } else {
    detailMounted.value = false;
  }
}

const thumbUrl = computed(() => {
  if (props.loadImage === false) return undefined;
  return compactThumb(getImageUrl(props.offer.imageUrl));
});

// Once the thumb is shown, warm the detail sheet's hero at idle
watchEffect(() => {
  if (thumbUrl.value) {
    prefetchImages([galleryImage(getImageUrl(props.offer.imageUrl))]);
  }
});

const urgency = computed(() => getDeadlineUrgency(props.offer.deadline, t));
</script>

<template>
  <li>
    <div
      class="flex gap-3 p-2 rounded-xl
             bg-white/80 dark:bg-white/[0.06]
             hover:bg-white dark:hover:bg-white/[0.10]
             border border-transparent dark:border-white/[0.04] hover:border-neutral-200/50 dark:hover:border-white/[0.08]
             cursor-pointer transition-all duration-150
             active:scale-[0.99] select-none"
      @click="openDetail"
    >
      <!-- Thumbnail -->
      <div class="relative w-24 md:w-32 shrink-0 aspect-[3/2] rounded-lg overflow-hidden bg-neutral-200 dark:bg-white/10">
        <img
          v-if="thumbUrl"
          :src="thumbUrl"
          :alt="offer.residence.adressLine1 ?? ''"
          class="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
        <div class="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/15 to-transparent pointer-events-none" />
      </div>

      <!-- Text content -->
      <div class="flex flex-col justify-between min-w-0 flex-1 py-0.5">
        <div class="min-w-0">
          <p class="font-semibold text-[0.8125rem] leading-snug truncate dark:text-neutral-100">
            {{ offer.residence.adressLine1 }}
          </p>
          <p class="text-xs text-neutral-500 dark:text-neutral-400 truncate">
            {{ offer.residence.adressLine2 }}
          </p>
        </div>

        <div class="flex items-end justify-between gap-2 mt-auto">
          <div class="min-w-0">
            <div class="flex items-center gap-1">
              <span
                class="inline-block w-1.5 h-1.5 rounded-full"
                :class="urgencyColors[urgency.color].dot"
              />
              <p
                class="text-[0.625rem] font-medium"
                :class="urgencyColors[urgency.color].text"
              >
                {{ t("offers.deadline") }}: {{ urgency.relative }}
              </p>
            </div>
            <p class="text-[0.8125rem] font-medium tabular-nums dark:text-neutral-200">
              {{ formatCurrency(offer.financials.monthlyRentIncludingAconto) }} / {{ t("financials.shortMonth") }}
            </p>
          </div>

          <span
            v-if="offer.position != null"
            class="text-base font-bold tabular-nums text-neutral-300 dark:text-neutral-600 shrink-0"
          >
            #{{ offer.position }}
          </span>
        </div>
      </div>
    </div>

    <OfferDetailSheet
      v-if="detailMounted"
      :offer="offer"
      @close="onDetailClose"
      @after-leave="onDetailAfterLeave"
    />
  </li>
</template>
