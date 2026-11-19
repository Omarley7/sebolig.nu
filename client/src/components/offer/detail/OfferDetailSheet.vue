<script setup lang="ts">
import type { Offer } from "@/types";
import { ExternalLink, Share2 } from "lucide-vue-next";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import DetailFrame from "~/components/shared/DetailFrame.vue";
import DetailGallery from "~/components/shared/DetailGallery.vue";
import DetailTitle from "~/components/shared/DetailTitle.vue";
import FinancialsModal from "~/components/shared/FinancialsModal.vue";
import KeptCopyNote from "~/components/shared/KeptCopyNote.vue";
import RentSummary from "~/components/shared/RentSummary.vue";
import SharePanel from "~/components/shared/SharePanel.vue";
import AppDialog from "~/components/ui/AppDialog.vue";
import { useNow } from "~/composables/useNow";
import { usePane } from "~/composables/usePane";
import { useSheet } from "~/composables/useSheet";
import { getDeadlineUrgency } from "~/lib/deadlineUrgency";
import { formatDate } from "~/lib/formatters";
import { isExpired } from "~/lib/offerTabs";
import { floorPlanFileName, offerShareText, type ShareLocale, type ShareOptions } from "~/lib/share";
import { useOffersStore } from "~/stores/offers";

const { t, locale } = useI18n();
const store = useOffersStore();
const now = useNow();

const props = defineProps<{
  offer: Offer;
  /** Shown inline in the desktop pane rather than in a sheet. */
  inline?: boolean;
  /** The item has disappeared from the store; the sheet slides out showing its last-known state. */
  gone?: boolean;
  /**
   * Why the card left its list, when the sheet shows the copy kept of it (the changes panel's, or
   * Afsluttet's). The sheet is read-only then: nothing in it can be answered any more.
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
const confirm = sheet.popup({ escapable: () => !store.isActioning });
const confirmAction = ref<"accept" | "decline">("accept");

const allImages = computed(() => {
  if (props.offer.images?.length) return props.offer.images;
  return props.offer.imageUrl ? [props.offer.imageUrl] : [];
});
const blueprints = computed(() => props.offer.blueprints ?? []);

function shareText(options: ShareOptions) {
  return offerShareText(props.offer, options, t, locale.value as ShareLocale);
}

const urgency = computed(() => getDeadlineUrgency(props.offer.deadline, t));
const deadlineTone = computed(() => {
  if (props.outcome || props.offer.recipientState !== "OfferReceived") return "bg-bg border border-border";
  if (urgency.value.color === "red") return "bg-urgent text-urgent-ink";
  if (urgency.value.color === "amber") return "bg-soon text-soon-ink";
  return "bg-bg border border-border";
});
const deadlineWhen = computed(() => {
  if (!props.offer.deadline) return null;
  const date = new Date(props.offer.deadline);
  const day = date.toLocaleDateString(locale.value === "en" ? "en-GB" : "da-DK", { weekday: "short", day: "numeric", month: "short" });
  // A deadline at midnight UTC is a date without a time of day.
  const hasTime = date.getUTCHours() !== 0 || date.getUTCMinutes() !== 0;
  const time = date.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
  const text = hasTime ? t("offers.deadlineAt", { day, time }) : day;
  return text.charAt(0).toUpperCase() + text.slice(1);
});
const deadlineBig = computed(() => {
  if (!props.offer.deadline) return t("offers.noDeadline");
  if (isExpired(props.offer, now.value)) return t("offers.status.expired");
  const relative = urgency.value.relative;
  return relative.charAt(0).toUpperCase() + relative.slice(1);
});
const availableFrom = computed(() => (props.offer.availableFrom ? formatDate(props.offer.availableFrom) : null));

// What the footer offers: answer, change the answer, or nothing once it can't be answered any more.
const answerable = computed(() => !props.outcome && !isExpired(props.offer, now.value));

const address = computed(() => [props.offer.residence.addressLine1, props.offer.residence.addressLine2].filter(Boolean).join(", "));
const findboligUrl = computed(() => `https://findbolig.nu/profile/my-offers?offerId=${props.offer.id}`);

function promptAction(action: "accept" | "decline") {
  confirmAction.value = action;
  confirm.open();
}

async function handleConfirm() {
  const success = confirmAction.value === "accept" ? await store.acceptOffer(props.offer.id) : await store.declineOffer(props.offer.id);
  if (success) confirm.close();
}
</script>

<template>
  <DetailFrame
    :sheet="sheet"
    :inline="inline"
    :label="t('offers.detailLabel', { address: offer.residence.addressLine1 })"
    @close="emit('close')"
    @after-leave="emit('after-leave')"
  >
    <DetailGallery :sheet="sheet" :images="allImages" :blueprints="blueprints" />

    <div class="flex flex-col gap-5 p-5">
      <KeptCopyNote v-if="outcome" :outcome="outcome" />

      <DetailTitle :residence="offer.residence" :rooms="offer.rooms" :area="offer.area" :company="offer.company" />

      <p v-if="offer.editedByLandlord && !outcome" class="chip self-start -mt-2 bg-soft text-soft-ink !font-semibold">{{ t("offers.editedByLandlord") }}</p>

      <div class="grid grid-cols-2 gap-2">
        <div class="flex flex-col gap-1.5 p-3.5 rounded-2xl" :class="deadlineTone">
          <span class="text-xs font-semibold opacity-90">{{ t("offers.deadline") }}</span>
          <span class="text-[17px] font-extrabold">{{ deadlineBig }}</span>
          <span v-if="deadlineWhen" class="text-[13px] tabular-nums opacity-90">{{ deadlineWhen }}</span>
        </div>
        <div class="flex flex-col gap-1.5 p-3.5 rounded-2xl bg-bg border border-border">
          <span class="label-caps">{{ t("offers.queuePosition") }}</span>
          <span class="text-[22px] font-extrabold tabular-nums">{{ offer.position != null ? t("common.positionShort", { n: offer.position }) : "–" }}</span>
          <span v-if="availableFrom" class="text-[13px] text-muted">{{ t("offers.availableFromDate", { date: availableFrom }) }}</span>
        </div>
      </div>

      <RentSummary :financials="offer.financials" @open="financials.open()" />

      <div class="grid grid-cols-2 gap-2">
        <button v-if="!outcome" type="button" class="btn btn-secondary" @click="sharing.open()">
          <Share2 class="size-4" aria-hidden="true" />
          {{ t("share.button") }}
        </button>
        <a :href="findboligUrl" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" :class="outcome ? 'col-span-2' : ''">
          <ExternalLink class="size-4" aria-hidden="true" />
          findbolig.nu
        </a>
      </div>
    </div>

    <template v-if="answerable" #footer>
      <!-- Primary actions pinned to the bottom of the sheet or pane -->
      <div class="shrink-0 flex flex-col gap-2.5 px-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] lg:pb-4 bg-surface border-t border-border">
        <template v-if="offer.recipientState === 'OfferReceived'">
          <span class="text-[13px] text-muted text-center">{{ t("offers.respondBefore") }}</span>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" class="btn btn-secondary btn-lg !text-[15px]" @click="promptAction('decline')">{{ t("offers.decline") }}</button>
            <button type="button" class="btn btn-primary btn-lg !text-[15px]" @click="promptAction('accept')">{{ t("offers.accept") }}</button>
          </div>
        </template>
        <div v-else-if="offer.recipientState === 'OfferAccepted'" class="grid grid-cols-2 gap-2">
          <button type="button" class="btn btn-secondary btn-lg !text-[15px]" @click="promptAction('decline')">{{ t("offers.undoAccept") }}</button>
          <span class="btn btn-lg !text-[15px] bg-yes text-yes-ink cursor-default">{{ t("offers.status.saidYes") }}</span>
        </div>
        <div v-else class="grid grid-cols-2 gap-2">
          <span class="btn btn-lg !text-[15px] bg-chip text-chip-ink cursor-default">{{ t("offers.status.declined") }}</span>
          <button type="button" class="btn btn-primary btn-lg !text-[15px]" @click="promptAction('accept')">{{ t("offers.accept") }}</button>
        </div>
      </div>
    </template>

    <template #popups>
      <FinancialsModal v-if="financials.isOpen" :financials="offer.financials" @close="financials.close()" />
      <SharePanel
        v-if="sharing.isOpen"
        kind="offer"
        :text="shareText"
        :floor-plan="blueprints[0] ?? null"
        :file-name="floorPlanFileName(offer.residence.addressLine1, t)"
        @close="sharing.close()"
      />
      <!-- Accepting and declining confirm with the accent: the answer can change until the deadline -->
      <AppDialog
        v-if="confirm.isOpen"
        :title="confirmAction === 'accept' ? t('offers.confirmAcceptTitle') : t('offers.confirmDeclineTitle')"
        :body="`${confirmAction === 'accept' ? t('offers.confirmAcceptBody') : t('offers.confirmDeclineBody')} ${address}.`"
        :note="t('offers.confirmNote')"
        :confirm-label="t('offers.confirm')"
        :loading="store.isActioning"
        @confirm="handleConfirm"
        @cancel="confirm.close()"
      />
    </template>
  </DetailFrame>
</template>
