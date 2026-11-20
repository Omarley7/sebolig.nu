<script setup lang="ts">
import type { Appointment } from "@/types";
import { atcb_action } from "add-to-calendar-button/no-pro";
import { CalendarPlus, Navigation } from "lucide-vue-next";
import { computed, onBeforeUnmount, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useDarkMode } from "~/composables/useDarkMode";
import { useHistoryLayer } from "~/composables/useHistoryLayer";
import { routeUrl } from "~/lib/route";

/**
 * Rute and Til kalender (Q18), on the Hjem hero and in the appointment detail only. Rute opens
 * Apple Maps on iOS and Google Maps elsewhere; Til kalender opens add-to-calendar-button's list.
 *
 * The list is a layer like any popup: back and Esc close it, not the sheet under it.
 */
const props = defineProps<{ appointment: Appointment }>();

const { t } = useI18n();
const { isDark } = useDarkMode();
const calendarEl = ref<HTMLButtonElement | null>(null);

// add-to-calendar-button draws its list in a host of its own on <body>, named after the button's
// id, and removes it on closing. Its backdrop closes it on a mouseup.
const pickerHost = () => (calendarEl.value?.id ? document.getElementById(`${calendarEl.value.id}-modal-host`) : null);
const closePicker = () =>
  pickerHost()?.shadowRoot?.getElementById("atcb-bgoverlay")?.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
const picker = useHistoryLayer({ onClose: closePicker });
// The list closed itself (its Close, its backdrop, a calendar picked): take its back step away too.
const pickerClosed = new MutationObserver(() => {
  if (pickerHost()) return;
  pickerClosed.disconnect();
  if (picker.isOpen) picker.close();
});
// Leaving with the list open (a route change): the list goes too; history is left alone, as for any layer.
onBeforeUnmount(() => {
  pickerClosed.disconnect();
  closePicker();
});

const route = computed(() => routeUrl(props.appointment.residence));
// add-to-calendar-button rejects a start without an end (or vice versa); with neither it makes an all-day event.
const hasTimeSlot = computed(() => !!(props.appointment.start && props.appointment.end));

async function addToCalendar() {
  const { appointment } = props;
  if (!appointment.date) return;
  await atcb_action(
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
  if (!pickerHost()) return;
  picker.open();
  pickerClosed.observe(document.body, { childList: true });
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
