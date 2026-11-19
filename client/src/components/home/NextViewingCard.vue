<script setup lang="ts">
import type { Appointment } from "@/types";
import { Image as ImageIcon } from "lucide-vue-next";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import ViewingActions from "~/components/appointment/ViewingActions.vue";
import { useNow } from "~/composables/useNow";
import { dateKey } from "~/lib/agenda";
import { formatPlaceFacts, formatShortDate } from "~/lib/formatters";
import { galleryImage } from "~/lib/imageTransform";
import { imageUrl } from "~/lib/imageUrl";

/** Hjem's hero (Q8): the next viewing, its photo on top (on the left on desktop), with Rute and Til kalender. */
const props = defineProps<{ appointment: Appointment }>();
const emit = defineEmits<{ open: [] }>();

const { t, locale } = useI18n();
const now = useNow();
const failed = ref(false);

const photo = computed(() => (props.appointment.imageUrl && !failed.value ? galleryImage(imageUrl(props.appointment.imageUrl)) : null));
const when = computed(() => {
  const date = props.appointment.date!;
  const today = dateKey(now.value);
  const tomorrow = dateKey(new Date(now.value.getTime() + 86_400_000));
  if (date === today) return t("common.today");
  if (date === tomorrow) return t("common.tomorrow");
  return formatShortDate(date, locale.value);
});
const facts = computed(() =>
  formatPlaceFacts({ addressLine2: props.appointment.residence.addressLine2, rooms: props.appointment.rooms, area: props.appointment.area }, t),
);
</script>

<template>
  <article class="card card-link overflow-hidden flex flex-col lg:flex-row">
    <button
      type="button"
      class="relative h-[132px] shrink-0 bg-soft text-soft-ink flex items-center justify-center lg:h-auto lg:w-56"
      :aria-label="t('appointments.detailLabel', { address: appointment.residence.addressLine1 })"
      @click="emit('open')"
    >
      <ImageIcon class="size-8" aria-hidden="true" />
      <img v-if="photo" :src="photo" alt="" class="absolute inset-0 size-full object-cover" @error="failed = true" />
      <span class="chip absolute left-3 top-3 !px-2.5 !py-[5px] bg-accent text-on-accent">{{ when }}</span>
    </button>
    <div class="flex-1 flex flex-col gap-3.5 p-4">
      <button type="button" class="flex gap-3.5 text-left" @click="emit('open')">
        <span class="w-[60px] shrink-0 flex flex-col tabular-nums">
          <template v-if="appointment.start">
            <span class="text-[22px] font-extrabold tracking-tight">{{ appointment.start }}</span>
            <span v-if="appointment.end" class="text-[13px] text-muted">{{ t("appointments.until", { time: appointment.end }) }}</span>
          </template>
          <span v-else class="text-xs font-semibold text-muted leading-tight">{{ t("appointments.noTime") }}</span>
        </span>
        <span class="flex flex-col gap-[3px] min-w-0">
          <span class="text-base font-bold">{{ appointment.residence.addressLine1 ?? appointment.title }}</span>
          <span v-if="facts" class="text-sm text-muted">{{ facts }}</span>
          <span v-if="appointment.position != null" class="text-[13px] text-muted">{{ t("common.queuePositionCap", { n: appointment.position }) }}</span>
        </span>
      </button>
      <ViewingActions :appointment="appointment" />
    </div>
  </article>
</template>
