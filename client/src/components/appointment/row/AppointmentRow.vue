<script setup lang="ts">
import type { Appointment } from "@/types";
import { Clock, MessageSquare } from "lucide-vue-next";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import RowPhoto from "~/components/ui/RowPhoto.vue";
import { useOpenDetail } from "~/composables/useDetailSheet";
import { formatPlaceFacts, formatRent, formatShortDate } from "~/lib/formatters";
import { followUp, senderLabel } from "~/lib/thread";
import { useChangesStore } from "~/stores/changes";

/**
 * An appointment in the agenda (Q5, Q15): the bold start and end time on the left, the address,
 * place and size, rent and queue position, and the photo on the right. Waiting for a date, it has
 * a clock and a dashed border; in Tidligere, it is quieter and names its date and the latest message.
 */
const props = defineProps<{
  appointment: Appointment;
  variant?: "upcoming" | "awaiting" | "past";
  selected?: boolean;
}>();

const { t, locale } = useI18n();
const openDetail = useOpenDetail();
const changes = useChangesStore();

const unseenMessage = computed(() =>
  changes.unseenMessages.some((c) => c.kind === "appointment" && c.itemId === props.appointment.id),
);
const changed = computed(() => !unseenMessage.value && changes.hasUnseen("appointment", props.appointment.id));

const facts = computed(() =>
  formatPlaceFacts({ addressLine2: props.appointment.residence.addressLine2, rooms: props.appointment.rooms, area: props.appointment.area }, t),
);
const money = computed(() => {
  const parts = [formatRent(props.appointment.financials.monthlyRentIncludingAconto, t)];
  if (props.appointment.position != null) parts.push(t("common.queuePosition", { n: props.appointment.position }));
  return parts.join(" · ");
});

const latest = computed(() => followUp(props.appointment.messages ?? []));
const latestText = computed(() => {
  if (!latest.value) return null;
  const body = latest.value.body.replace(/\s+/g, " ").trim() || t("appointments.thread.attachment");
  return `${senderLabel(latest.value, t)}: ${body}`;
});
</script>

<template>
  <li>
    <!-- Tidligere: quieter, with its date -->
    <button
      v-if="variant === 'past'"
      type="button"
      class="w-full flex gap-3 px-4 py-3.5 rounded-2xl bg-subtle text-left"
      :class="selected ? 'ring-2 ring-accent' : ''"
      @click="openDetail(appointment.id)"
    >
      <span class="w-[52px] shrink-0 flex flex-col tabular-nums">
        <span class="text-sm font-bold text-muted">{{ appointment.date ? formatShortDate(appointment.date, locale) : "" }}</span>
        <span class="text-xs text-muted">{{ appointment.start ?? "" }}</span>
      </span>
      <span class="flex-1 min-w-0 flex flex-col gap-[3px]">
        <span class="text-[15px] font-semibold text-ink-2 truncate">{{ appointment.residence.addressLine1 }}</span>
        <span v-if="latestText" class="text-[13px] text-muted truncate">{{ latestText }}</span>
      </span>
    </button>

    <button
      v-else
      type="button"
      class="card card-link w-full flex gap-3 items-start py-3.5 pl-4 pr-3.5 text-left"
      :class="[variant === 'awaiting' ? '!border-dashed !border-border-strong' : '', selected ? '!border-accent ring-1 ring-accent' : '']"
      :aria-current="selected ? 'true' : undefined"
      @click="openDetail(appointment.id)"
    >
      <!-- Time column -->
      <span v-if="variant === 'awaiting'" class="w-[52px] shrink-0 text-muted"><Clock class="size-[22px]" aria-hidden="true" /></span>
      <span v-else-if="appointment.start" class="w-[52px] shrink-0 flex flex-col tabular-nums">
        <span class="text-[17px] font-extrabold tracking-tight">{{ appointment.start }}</span>
        <span v-if="appointment.end" class="text-xs text-muted">{{ appointment.end }}</span>
      </span>
      <span v-else class="w-[52px] shrink-0 text-xs leading-tight font-semibold text-muted">{{ t("appointments.noTime") }}</span>

      <span class="flex-1 min-w-0 flex flex-col gap-[3px]">
        <span class="text-[15px] font-bold" :class="appointment.cancelled ? 'line-through text-ink-2' : ''">
          {{ appointment.residence.addressLine1 ?? appointment.title }}
        </span>
        <span v-if="facts" class="text-[13px] text-muted">{{ facts }}</span>
        <span class="text-[13px] text-muted">{{ variant === "awaiting" ? t("appointments.awaitingDateNote") : money }}</span>
        <span class="flex flex-wrap gap-1.5 mt-1 empty:hidden">
          <span v-if="appointment.cancelled" class="chip bg-urgent text-urgent-ink">{{ t("appointments.cancelled") }}</span>
          <span
            v-if="unseenMessage"
            role="button"
            tabindex="0"
            class="chip bg-soft text-soft-ink !font-semibold"
            @click.stop="openDetail(appointment.id, 'thread')"
            @keydown.enter.stop="openDetail(appointment.id, 'thread')"
          >
            <MessageSquare class="size-[13px]" :stroke-width="2.2" aria-hidden="true" />
            {{ t("appointments.newMessage") }}
          </span>
          <span v-else-if="changed" class="chip bg-soft text-soft-ink !font-semibold">{{ t("changes.changed") }}</span>
        </span>
      </span>

      <RowPhoto :src="appointment.imageUrl" />
    </button>
  </li>
</template>
