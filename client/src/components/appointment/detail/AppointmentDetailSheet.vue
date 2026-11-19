<script setup lang="ts">
import type { Appointment } from "@/types";
import { ExternalLink, Share2 } from "lucide-vue-next";
import { computed, nextTick, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import ViewingActions from "~/components/appointment/ViewingActions.vue";
import AppointmentThread from "~/components/appointment/detail/AppointmentThread.vue";
import DetailFrame from "~/components/shared/DetailFrame.vue";
import DetailGallery from "~/components/shared/DetailGallery.vue";
import DetailTitle from "~/components/shared/DetailTitle.vue";
import FinancialsModal from "~/components/shared/FinancialsModal.vue";
import KeptCopyNote from "~/components/shared/KeptCopyNote.vue";
import RentSummary from "~/components/shared/RentSummary.vue";
import SharePanel from "~/components/shared/SharePanel.vue";
import { usePane } from "~/composables/usePane";
import { useSheet } from "~/composables/useSheet";
import { floorPlanFileName, viewingShareText, type ShareLocale, type ShareOptions } from "~/lib/share";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const { t, locale } = useI18n();

const props = defineProps<{
  appointment: Appointment;
  /** Shown inline in the desktop pane rather than in a sheet. */
  inline?: boolean;
  /** The item has disappeared from the store; the sheet slides out showing its last-known state. */
  gone?: boolean;
  /** Where to open: "thread" scrolls to the messages. */
  section?: string | null;
  /**
   * Why the card left its list, when the sheet shows the copy the changes panel kept of it. The
   * sheet is read-only then: nothing in it can be answered or booked any more.
   */
  outcome?: string | null;
}>();

const emit = defineEmits<{
  close: [];
  "after-leave": [];
}>();

const sheet = props.inline ? usePane() : useSheet({ closeWhen: () => props.gone });
const financials = sheet.popup();
const sharing = sheet.popup();

// Only a viewing someone can still come along to.
const canShare = computed(() => !!props.appointment.date && !props.appointment.cancelled && !props.outcome);

function shareText(options: ShareOptions) {
  return viewingShareText(props.appointment, options, t, locale.value as ShareLocale);
}

const hasValidOfferId = computed(() => UUID_RE.test(props.appointment.offerId ?? ""));

const allImages = computed(() => {
  if (props.appointment.images?.length) return props.appointment.images;
  return props.appointment.imageUrl ? [props.appointment.imageUrl] : [];
});

const blueprints = computed(() => props.appointment.blueprints ?? []);

const offerUrl = computed(() =>
  hasValidOfferId.value ? `https://findbolig.nu/profile/my-offers?offerId=${props.appointment.offerId}` : null,
);

// findbolig.nu's messages page, its thread list filtered to the offer's thread by its own
// `relatedEntities` query parameter: opened on desktop, one tap away on a phone. The offer page's
// "skriv til udlejer" dialog can't be linked to. Should findbolig.nu drop the parameter, this
// still lands on the messages page.
const threadUrl = computed(() =>
  hasValidOfferId.value ? `https://findbolig.nu/profile/messages?relatedEntities=${props.appointment.offerId}` : null,
);

const day = computed(() => {
  if (!props.appointment.date) return null;
  const text = new Date(props.appointment.date).toLocaleDateString(locale.value === "en" ? "en-GB" : "da-DK", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return text.charAt(0).toUpperCase() + text.slice(1);
});
const time = computed(() => {
  const { start, end } = props.appointment;
  if (start && end) return `${start}–${end}`;
  if (start) return start;
  if (end) return t("appointments.until", { time: end });
  return null;
});

const messages = computed(() => props.appointment.messages ?? []);
const threadEl = ref<HTMLElement | null>(null);

onMounted(async () => {
  if (props.section !== "thread") return;
  await nextTick();
  const thread = threadEl.value;
  const scroller = thread?.closest<HTMLElement>("[data-sheet-scroll]");
  if (!thread || !scroller) return;
  scroller.scrollTop += thread.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
});
</script>

<template>
  <DetailFrame
    :sheet="sheet"
    :inline="inline"
    :label="t('appointments.detailLabel', { address: appointment.residence.addressLine1 })"
    @close="emit('close')"
    @after-leave="emit('after-leave')"
  >
    <DetailGallery :sheet="sheet" :images="allImages" :blueprints="blueprints" />

    <div class="flex flex-col gap-5 p-5">
      <KeptCopyNote v-if="outcome" :outcome="outcome" />

      <DetailTitle :residence="appointment.residence" :rooms="appointment.rooms" :area="appointment.area" />

      <div class="flex flex-col gap-3.5 p-4 rounded-2xl bg-bg border border-border">
        <div class="flex justify-between gap-3">
          <div class="flex flex-col gap-0.5">
            <span class="label-caps">{{ t("appointments.openHouse") }}</span>
            <template v-if="appointment.date">
              <span class="text-base font-bold">{{ day }}</span>
              <span v-if="time" class="text-[22px] font-extrabold tracking-tight tabular-nums">{{ time }}</span>
              <span v-else class="text-sm text-muted">{{ t("appointments.noTime") }}</span>
            </template>
            <span v-else class="text-base font-bold text-muted">{{ t("appointments.noDate") }}</span>
            <span v-if="appointment.cancelled" class="chip self-start mt-1 bg-urgent text-urgent-ink">{{ t("appointments.cancelled") }}</span>
          </div>
          <div v-if="appointment.position != null" class="flex flex-col items-end gap-0.5">
            <span class="label-caps">{{ t("appointments.queuePosition") }}</span>
            <span class="text-[22px] font-extrabold tabular-nums">#{{ appointment.position }}</span>
          </div>
        </div>
        <ViewingActions v-if="appointment.date && !appointment.cancelled && !outcome" :appointment="appointment" />
      </div>

      <RentSummary :financials="appointment.financials" @open="financials.open()" />

      <div v-if="messages.length" ref="threadEl">
        <AppointmentThread :messages="messages" :reply-url="outcome ? null : threadUrl" />
      </div>

      <div class="grid grid-cols-2 gap-2 pt-3 border-t border-divider">
        <button v-if="canShare" type="button" class="btn btn-secondary" @click="sharing.open()">
          <Share2 class="size-4" aria-hidden="true" />
          {{ t("share.button") }}
        </button>
        <a v-if="offerUrl" :href="offerUrl" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" :class="canShare ? '' : 'col-span-2'">
          <ExternalLink class="size-4" aria-hidden="true" />
          findbolig.nu
        </a>
      </div>
    </div>

    <template #popups>
      <FinancialsModal v-if="financials.isOpen" :financials="appointment.financials" @close="financials.close()" />
      <SharePanel
        v-if="sharing.isOpen"
        kind="viewing"
        :text="shareText"
        :floor-plan="blueprints[0] ?? null"
        :file-name="floorPlanFileName(appointment.residence.addressLine1, t)"
        @close="sharing.close()"
      />
    </template>
  </DetailFrame>
</template>
