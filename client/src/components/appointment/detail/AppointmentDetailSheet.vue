<script setup lang="ts">
import type { Appointment } from "@/types";
import "add-to-calendar-button";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useDarkMode } from "~/composables/useDarkMode";
import { useSheet } from "~/composables/useSheet";
import { formatCurrency, formatTimeSlot } from "~/lib/formatters";
import FinancialsModal from "~/components/shared/FinancialsModal.vue";
import BottomSheet from "~/components/shared/BottomSheet.vue";
import DetailGallery from "~/components/shared/DetailGallery.vue";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const { t } = useI18n();
const { isDark } = useDarkMode();

const props = defineProps<{
  appointment: Appointment;
  includeDate?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  "after-leave": [];
}>();

const sheet = useSheet();
const financials = sheet.popup();

const hasValidOfferId = computed(() => UUID_RE.test(props.appointment.offerId ?? ""));

// add-to-calendar-button rejects a start without an end (or vice versa); with neither it makes an all-day event.
const hasTimeSlot = computed(() => !!(props.appointment.start && props.appointment.end));

const allImages = computed(() => {
  if (props.appointment.images?.length) return props.appointment.images;
  return [props.appointment.imageUrl];
});

const blueprints = computed(() => props.appointment.blueprints ?? []);

function handleMapClick() {
  const address = `${props.appointment.residence.addressLine1}, ${props.appointment.residence.addressLine2}`;
  window.open(
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
    "_blank",
  );
}

function openOnFindbolig() {
  if (!hasValidOfferId.value) return;
  window.open(
    `https://findbolig.nu/profile/my-offers?offerId=${props.appointment.offerId}`,
    "_blank",
  );
}
</script>

<template>
  <BottomSheet :sheet="sheet" @close="emit('close')" @after-leave="emit('after-leave')">
    <DetailGallery :sheet="sheet" :images="allImages" :blueprints="blueprints" />

    <!-- Content -->
    <div class="p-5 space-y-5">
      <!-- Title + Address -->
      <div>
        <h2 class="text-lg font-bold text-neutral-900 dark:text-white leading-snug">
          {{ appointment.title }}
        </h2>
        <button class="flex items-center gap-1.5 mt-1.5 group" @click="handleMapClick">
          <p
            class="text-sm text-neutral-500 dark:text-neutral-400
                   group-hover:text-neutral-700 dark:group-hover:text-neutral-300 transition-colors"
          >
            {{ appointment.residence.addressLine1 }}, {{ appointment.residence.addressLine2 }}
          </p>
          <img
            src="/icons/map.svg"
            alt=""
            class="size-4 opacity-40 group-hover:opacity-70 transition-opacity dark:invert"
          />
        </button>
      </div>

      <hr class="border-neutral-200 dark:border-neutral-700/50" />

      <!-- Date + Time + Queue -->
      <div class="flex items-start justify-between gap-4">
        <div>
          <p
            class="text-xs font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-1"
          >
            {{ t("appointments.openHouse") }}
          </p>
          <p
            v-if="appointment.date"
            class="text-sm font-medium text-neutral-800 dark:text-neutral-200 tabular-nums"
          >
            {{ formatTimeSlot(appointment, t, true) }}
          </p>
          <p v-else class="text-sm italic text-neutral-400 dark:text-neutral-500">
            {{ t("appointments.noDate") }}
          </p>

          <!-- Calendar button -->
          <div v-if="appointment.date" class="mt-3">
            <add-to-calendar-button
              :name="appointment.title"
              options="'Apple','Google','Microsoft365','Outlook.com'"
              :lightMode="isDark ? 'dark' : 'light'"
              :location="`${appointment.residence.addressLine1}, ${appointment.residence.addressLine2}`"
              :startDate="appointment.date"
              :endDate="appointment.date"
              :startTime="hasTimeSlot ? appointment.start : undefined"
              :endTime="hasTimeSlot ? appointment.end : undefined"
              timeZone="Europe/Copenhagen"
              listStyle="dropup-static"
              hideBackground
              :label="t('appointments.addToCalendar')"
              pastDateHandling=""
              hideTextLabelList
              size="4|3|3"
              buttonStyle="3d"
              hideBranding
            />
          </div>
        </div>

        <!-- Queue position -->
        <div v-if="appointment.position != null" class="text-right shrink-0">
          <p
            class="text-xs font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-1"
          >
            {{ t("appointments.queuePosition") }}
          </p>
          <p class="text-2xl font-bold tabular-nums text-neutral-800 dark:text-neutral-200">
            #{{ appointment.position }}
          </p>
        </div>
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
          <p
            class="text-xs font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-0.5"
          >
            {{ t("financials.rent") }}
          </p>
          <p class="text-base font-semibold tabular-nums text-neutral-800 dark:text-neutral-100">
            {{ formatCurrency(appointment.financials.monthlyRentIncludingAconto) }} /
            {{ t("financials.shortMonth") }}
          </p>
        </div>
        <div class="text-right">
          <p class="text-xs text-neutral-400 dark:text-neutral-500 mb-0.5">
            {{ t("financials.firstPayment") }}
          </p>
          <p class="text-sm font-medium tabular-nums text-neutral-700 dark:text-neutral-200">
            {{ formatCurrency(appointment.financials.firstPayment) }}
          </p>
        </div>
        <img
          src="/icons/chevron-down.svg"
          alt=""
          class="size-4 -rotate-90 opacity-30 dark:invert shrink-0 ml-2"
        />
      </button>

      <!-- Open on findbolig -->
      <button
        v-if="hasValidOfferId"
        class="w-full flex items-center justify-center gap-2 p-3 rounded-xl
               border border-neutral-200 dark:border-neutral-700/50
               hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors"
        @click="openOnFindbolig"
      >
        <img src="/icons/external-link.svg" alt="" class="size-4 opacity-50 dark:invert" />
        <span class="text-sm font-medium text-neutral-600 dark:text-neutral-300">
          {{ t("appointments.openOnFindbolig") }}
        </span>
      </button>
    </div>

    <template #popups>
      <!-- Financials modal -->
      <FinancialsModal
        v-if="financials.isOpen"
        :financials="appointment.financials"
        @close="financials.close()"
      />
    </template>
  </BottomSheet>
</template>
