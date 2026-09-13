<script setup lang="ts">
import type { Appointment } from "@/types";
import { computed, nextTick, ref, watchEffect } from "vue";
import { useI18n } from "vue-i18n";
import { useAppointmentsStore } from "~/stores/appointments";
import { compactThumb, galleryImage } from "~/lib/imageTransform";
import { prefetchImages } from "~/lib/prefetch";
import { formatCurrency, formatTimeSlot } from "~/lib/formatters";
import AppointmentDetailSheet from "../detail/AppointmentDetailSheet.vue";

const { t } = useI18n();
const { getImageUrl } = useAppointmentsStore();

const props = defineProps<{
  appointment: Appointment;
  includeDate?: boolean;
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
    // User re-opened during close animation — force remount
    detailMounted.value = false;
    await nextTick();
    detailMounted.value = true;
  } else {
    detailMounted.value = false;
  }
}

const thumbUrl = computed(() => {
  if (props.loadImage === false) return undefined;
  return compactThumb(getImageUrl(props.appointment.imageUrl));
});

// Once the thumb is shown, warm the detail sheet's hero at idle
watchEffect(() => {
  if (thumbUrl.value) {
    prefetchImages([galleryImage(getImageUrl(props.appointment.imageUrl))]);
  }
});

const timeLabel = computed(() => formatTimeSlot(props.appointment, props.includeDate));
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
      :class="{ 'opacity-50 grayscale-[30%]': appointment.cancelled }"
      @click="openDetail"
    >
      <!-- Thumbnail -->
      <div class="relative w-24 md:w-32 shrink-0 aspect-[3/2] rounded-lg overflow-hidden bg-neutral-200 dark:bg-white/10">
        <img
          v-if="thumbUrl"
          :src="thumbUrl"
          :alt="appointment.residence.adressLine1 ?? appointment.title"
          class="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
        <div class="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/15 to-transparent pointer-events-none" />

        <!-- Cancelled badge -->
        <div
          v-if="appointment.cancelled"
          class="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[0.625rem] font-semibold uppercase tracking-wide bg-red-500/90 text-white"
        >
          {{ t("appointments.cancelled") }}
        </div>
      </div>

      <!-- Text content -->
      <div class="flex flex-col justify-between min-w-0 flex-1 py-0.5">
        <div class="min-w-0">
          <p class="font-semibold text-[0.8125rem] leading-snug truncate dark:text-neutral-100">
            {{ appointment.residence.adressLine1 }}
          </p>
          <p class="text-xs text-neutral-500 dark:text-neutral-400 truncate">
            {{ appointment.residence.adressLine2 }}
          </p>
        </div>

        <div class="flex items-end justify-between gap-2 mt-auto">
          <div class="min-w-0">
            <p v-if="appointment.date" class="text-xs text-neutral-500 dark:text-neutral-400 truncate tabular-nums">
              {{ timeLabel }}
            </p>
            <p v-else class="text-xs italic text-neutral-400 dark:text-neutral-500">
              {{ t("appointments.noDate") }}
            </p>
            <p class="text-[0.8125rem] font-medium tabular-nums dark:text-neutral-200">
              {{ formatCurrency(appointment.financials.monthlyRentIncludingAconto) }} / {{ t("financials.shortMonth") }}
            </p>
          </div>

          <span
            v-if="appointment.position != null"
            class="text-base font-bold tabular-nums text-neutral-300 dark:text-neutral-600 shrink-0"
          >
            #{{ appointment.position }}
          </span>
        </div>
      </div>
    </div>

    <AppointmentDetailSheet
      v-if="detailMounted"
      :appointment="appointment"
      :include-date="includeDate"
      :cached-thumb="thumbUrl"
      @close="onDetailClose"
      @after-leave="onDetailAfterLeave"
    />
  </li>
</template>
