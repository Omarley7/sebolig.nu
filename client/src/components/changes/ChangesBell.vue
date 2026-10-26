<script setup lang="ts">
import type { Appointment, Offer } from "@/types";
import { ref, shallowRef } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import AppointmentDetailSheet from "~/components/appointment/detail/AppointmentDetailSheet.vue";
import OfferDetailSheet from "~/components/offer/detail/OfferDetailSheet.vue";
import { removalText } from "~/lib/changeText";
import type { RowTarget } from "~/localData/changes";
import { useChangesStore } from "~/stores/changes";
import ChangesSheet from "./ChangesSheet.vue";

const { t } = useI18n();
const changes = useChangesStore();
const route = useRoute();
const router = useRouter();

const isOpen = ref(false);
// What to open once the panel has slid out and given back its history entry.
let toOpen: NonNullable<RowTarget> | null = null;
// The copy of a card that left its list, shown read-only, with why it left.
const copy = shallowRef<{ appointment?: Appointment; offer?: Offer; outcome: string } | null>(null);

/**
 * Opens what the tapped row is about: a card still in its list on its list's page, through the
 * list's `?open=` link, or the copy of a card that left, right here.
 */
async function onAfterLeave() {
  isOpen.value = false;
  const target = toOpen;
  toOpen = null;
  if (!target) return;
  if ("copy" in target) {
    const outcome = removalText(target.kind, target.state, target.copy, t);
    copy.value = target.kind === "appointment" ? { appointment: target.copy as Appointment, outcome } : { offer: target.copy as Offer, outcome };
    return;
  }
  const to = { name: target.page, query: { open: target.itemId } };
  // On the list's own page already: no extra step back to the same page.
  await (route.name === target.page ? router.replace(to) : router.push(to));
}
</script>

<template>
  <div>
    <button
      class="relative p-1.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
      :aria-label="t('changes.open', { count: changes.unseenCount }, changes.unseenCount)"
      @click="isOpen = true"
    >
      <img src="/icons/bell.svg" alt="" class="size-5 dark:invert" />
      <span
        v-if="changes.unseenCount > 0"
        class="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-sky-500 text-white
               text-[0.625rem] font-bold leading-4 text-center tabular-nums"
      >
        {{ changes.unseenCount > 99 ? "99+" : changes.unseenCount }}
      </span>
    </button>
    <ChangesSheet v-if="isOpen" @open-row="(target) => (toOpen = target)" @after-leave="onAfterLeave" />
    <AppointmentDetailSheet
      v-if="copy?.appointment"
      :appointment="copy.appointment"
      include-date
      :outcome="copy.outcome"
      @after-leave="copy = null"
    />
    <OfferDetailSheet v-if="copy?.offer" :offer="copy.offer" :outcome="copy.outcome" @after-leave="copy = null" />
  </div>
</template>
