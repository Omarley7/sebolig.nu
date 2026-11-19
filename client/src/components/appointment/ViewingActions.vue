<script setup lang="ts">
import type { Appointment } from "@/types";
import { atcb_action } from "add-to-calendar-button/no-pro";
import { CalendarPlus, Navigation } from "lucide-vue-next";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useDarkMode } from "~/composables/useDarkMode";
import { routeUrl } from "~/lib/route";

/**
 * Rute and Til kalender (Q18), on the Hjem hero and in the appointment detail only. Rute opens
 * Apple Maps on iOS and Google Maps elsewhere; Til kalender opens add-to-calendar-button's list.
 */
const props = defineProps<{ appointment: Appointment }>();

const { t } = useI18n();
const { isDark } = useDarkMode();
const calendarEl = ref<HTMLButtonElement | null>(null);

const route = computed(() => routeUrl(props.appointment.residence));
// add-to-calendar-button rejects a start without an end (or vice versa); with neither it makes an all-day event.
const hasTimeSlot = computed(() => !!(props.appointment.start && props.appointment.end));

function addToCalendar() {
  const { appointment } = props;
  if (!appointment.date) return;
  void atcb_action(
    {
      name: appointment.title,
      location: [appointment.residence.addressLine1, appointment.residence.addressLine2].filter(Boolean).join(", "),
      startDate: appointment.date,
      endDate: appointment.date,
      startTime: hasTimeSlot.value ? appointment.start! : undefined,
      endTime: hasTimeSlot.value ? appointment.end! : undefined,
      timeZone: "Europe/Copenhagen",
      options: ["Apple", "Google", "Microsoft365", "Outlook.com", "iCal"],
      listStyle: "modal",
      lightMode: isDark.value ? "dark" : "light",
      hideBranding: true,
    },
    calendarEl.value ?? undefined,
  );
}
</script>

<template>
  <div class="grid grid-cols-2 gap-2">
    <a :href="route" target="_blank" rel="noopener noreferrer" class="btn btn-primary" @click.stop>
      <Navigation class="size-4" aria-hidden="true" />
      {{ t("appointments.route") }}
    </a>
    <button ref="calendarEl" type="button" class="btn btn-soft" :disabled="!appointment.date" @click.stop="addToCalendar">
      <CalendarPlus class="size-4" aria-hidden="true" />
      {{ t("appointments.addToCalendar") }}
    </button>
  </div>
</template>
