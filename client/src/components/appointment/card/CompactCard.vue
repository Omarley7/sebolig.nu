<script setup lang="ts">
import { imageUrl } from "~/lib/imageUrl";
import type { Appointment } from "@/types";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useOpenDetail } from "~/composables/useDetailSheet";
import { compactThumb } from "~/lib/imageTransform";
import { formatCurrency, formatSentAt, formatTimeSlot } from "~/lib/formatters";
import { followUp, senderLabel } from "~/lib/thread";

const { t } = useI18n();

const props = defineProps<{
  appointment: Appointment;
  includeDate?: boolean;
  loadImage?: boolean;
}>();

const openDetail = useOpenDetail();

const thumbUrl = computed(() => {
  if (props.loadImage === false) return undefined;
  return compactThumb(imageUrl(props.appointment.imageUrl));
});

const timeLabel = computed(() => formatTimeSlot(props.appointment, t, props.includeDate));

// The latest message, once anything came after the invitation.
const latest = computed(() => followUp(props.appointment.messages ?? []));
const latestText = computed(() => {
  const body = latest.value?.body.replace(/\s+/g, " ").trim();
  return body || (latest.value?.hasAttachments ? t("appointments.thread.attachment") : "");
});
</script>

<template>
  <li>
    <div
      class="flex flex-col gap-1.5 p-2 rounded-xl
             bg-white/80 dark:bg-white/[0.06]
             hover:bg-white dark:hover:bg-white/[0.10]
             border border-transparent dark:border-white/[0.04] hover:border-neutral-200/50 dark:hover:border-white/[0.08]
             cursor-pointer transition-all duration-150
             active:scale-[0.99] select-none"
      :class="{ 'opacity-50 grayscale-[30%]': appointment.cancelled }"
      @click="openDetail(appointment.id)"
    >
      <div class="flex gap-3">
        <!-- Thumbnail -->
        <div class="relative w-24 md:w-32 shrink-0 aspect-[3/2] rounded-lg overflow-hidden bg-neutral-200 dark:bg-white/10">
          <img
            v-if="thumbUrl"
            :src="thumbUrl"
            :alt="appointment.residence.addressLine1 ?? appointment.title"
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
              {{ appointment.residence.addressLine1 }}
            </p>
            <p class="text-xs text-neutral-500 dark:text-neutral-400 truncate">
              {{ appointment.residence.addressLine2 }}
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

      <!-- Latest message, when something came after the invitation -->
      <button
        v-if="latest"
        type="button"
        class="flex items-baseline gap-1 min-w-0 px-2 py-1 rounded-lg text-left text-xs
               bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200/70 dark:hover:bg-white/10 transition-colors"
        @click.stop="openDetail(appointment.id, 'thread')"
      >
        <span class="font-medium shrink-0 max-w-[40%] truncate text-neutral-700 dark:text-neutral-200">{{ senderLabel(latest, t) }}</span>
        <span class="shrink-0 tabular-nums text-neutral-400 dark:text-neutral-500">· {{ formatSentAt(latest.sentAt) }} ·</span>
        <span class="truncate text-neutral-500 dark:text-neutral-400">{{ latestText }}</span>
      </button>
    </div>
  </li>
</template>
