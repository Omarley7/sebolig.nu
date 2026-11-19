<script setup lang="ts">
import type { WaitingList } from "@/types";
import { ExternalLink, MapPin } from "lucide-vue-next";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useSheet } from "~/composables/useSheet";
import { useWaitingListsStore } from "~/stores/waitingLists";
import BottomSheet from "~/components/shared/BottomSheet.vue";
import DetailGallery from "~/components/shared/DetailGallery.vue";
import AppDialog from "~/components/ui/AppDialog.vue";
import { formatKr } from "~/lib/formatters";

const { t } = useI18n();
const store = useWaitingListsStore();

const props = defineProps<{
  list: WaitingList;
  /** The item has disappeared from the store; the sheet slides out showing its last-known state. */
  gone?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  "after-leave": [];
}>();

const sheet = useSheet({ closeWhen: () => props.gone });
const confirmUnsubscribe = sheet.popup({ escapable: () => !store.isMutating });

const allImages = computed(() => props.list.images ?? []);

const appliedSinceFormatted = computed(() => {
  if (!props.list.appliedSince) return null;
  return new Date(props.list.appliedSince).toLocaleDateString("da-DK", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
});

const mapUrl = computed(() => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(props.list.address)}`);
const findboligUrl = computed(() => `https://findbolig.nu/property/${props.list.propertyShortId}`);

const span = (min: number, max: number, format: (n: number) => string = String) =>
  format(min) === format(max) ? format(min) : `${format(min)}–${format(max)}`;
const rentRange = computed(() => `${span(props.list.minRent, props.list.maxRent, formatKr)}\u00a0${t("financials.krPerMonth")}`);
const sizeRange = computed(
  () =>
    `${t("waitingLists.detail.roomsRange", { rooms: span(props.list.minRooms, props.list.maxRooms) })} · ${span(props.list.minArea, props.list.maxArea)} m²`,
);

async function handleReactivate() {
  await store.setActive(props.list.propertyId);
}

async function handleConfirmUnsubscribe() {
  const ok = await store.unsubscribe(props.list.propertyId);
  // Closing the sheet also closes the confirm dialog on top of it
  if (ok) sheet.close();
}
</script>

<template>
  <BottomSheet :sheet="sheet" :label="t('waitingLists.detailLabel', { name: list.name })" @close="emit('close')" @after-leave="emit('after-leave')">
    <DetailGallery :sheet="sheet" :images="allImages" :blueprints="list.blueprints ?? []" />

    <div class="flex flex-col gap-5 p-5">
      <div class="flex flex-col gap-1">
        <div class="flex items-center gap-2 pr-10">
          <h2 class="text-[21px] font-extrabold tracking-tight">{{ list.name }}</h2>
          <span class="chip bg-chip text-chip-ink">
            {{ list.status === "Active" ? t("waitingLists.card.statusActive") : t("waitingLists.card.statusPassive") }}
          </span>
        </div>
        <a :href="mapUrl" target="_blank" rel="noopener noreferrer" class="self-start min-h-11 flex items-center gap-1.5 text-sm text-muted">
          {{ list.address }}
          <MapPin class="size-3.5" aria-hidden="true" />
        </a>
        <span class="text-[13px] text-muted">{{ [list.organization.name, list.company.name].filter(Boolean).join(" · ") }}</span>
      </div>

      <div v-if="list.status === 'Passive'" class="flex flex-col gap-2.5 p-4 rounded-2xl bg-soft text-soft-ink">
        <span class="text-sm leading-snug">{{ t("waitingLists.detail.passiveNote") }}</span>
        <button type="button" class="btn btn-primary !min-h-12 !text-[15px] !font-bold" :disabled="store.isMutating" @click="handleReactivate">
          {{ t("waitingLists.card.reactivate") }}
        </button>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div class="flex flex-col gap-1 p-3.5 rounded-2xl bg-bg border border-border">
          <span class="label-caps">{{ t("waitingLists.card.bestPosition") }}</span>
          <span class="text-2xl font-extrabold tabular-nums">{{ list.bestPosition != null ? `#${list.bestPosition}` : "–" }}</span>
        </div>
        <div class="flex flex-col gap-1 p-3.5 rounded-2xl bg-bg border border-border">
          <span class="label-caps">{{ t("waitingLists.detail.appliedTo") }}</span>
          <span class="text-2xl font-extrabold tabular-nums">
            {{ list.residencesAppliedCount }}
            <span class="text-sm font-semibold">{{ t("waitingLists.detail.residences", list.residencesAppliedCount) }}</span>
          </span>
        </div>
      </div>

      <dl class="flex flex-col rounded-2xl border border-border overflow-hidden">
        <div class="flex justify-between gap-3 px-4 py-3 border-b border-divider">
          <dt class="text-sm text-muted">{{ t("waitingLists.detail.rent") }}</dt>
          <dd class="text-sm font-semibold tabular-nums">{{ rentRange }}</dd>
        </div>
        <div class="flex justify-between gap-3 px-4 py-3 border-b border-divider">
          <dt class="text-sm text-muted">{{ t("waitingLists.detail.size") }}</dt>
          <dd class="text-sm font-semibold tabular-nums">{{ sizeRange }}</dd>
        </div>
        <div v-if="appliedSinceFormatted" class="flex justify-between gap-3 px-4 py-3">
          <dt class="text-sm text-muted">{{ t("waitingLists.detail.appliedSinceLabel") }}</dt>
          <dd class="text-sm font-semibold tabular-nums">{{ appliedSinceFormatted }}</dd>
        </div>
      </dl>

      <a :href="findboligUrl" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">
        <ExternalLink class="size-4" aria-hidden="true" />
        {{ t("waitingLists.detail.openOnFindbolig") }}
      </a>

      <section class="flex flex-col gap-2 pt-4 border-t border-divider">
        <h3 class="text-[13px] font-bold text-urgent-ink">{{ t("waitingLists.detail.dangerZone") }}</h3>
        <button
          type="button"
          class="btn bg-surface border border-danger-border text-urgent-ink"
          :disabled="store.isMutating"
          @click="confirmUnsubscribe.open()"
        >
          {{ t("waitingLists.detail.unsubscribe") }}
        </button>
        <span class="text-xs leading-snug text-muted">{{ t("waitingLists.confirm.unsubscribeBody") }}</span>
      </section>
    </div>

    <template #popups>
      <!-- Leaving a waiting list can't be undone: it confirms in red -->
      <AppDialog
        v-if="confirmUnsubscribe.isOpen"
        :title="t('waitingLists.confirm.unsubscribeTitle', { name: list.name })"
        :body="t('waitingLists.confirm.unsubscribeBody')"
        :confirm-label="t('waitingLists.confirm.confirm')"
        danger
        :loading="store.isMutating"
        @confirm="handleConfirmUnsubscribe"
        @cancel="confirmUnsubscribe.close()"
      />
    </template>
  </BottomSheet>
</template>
