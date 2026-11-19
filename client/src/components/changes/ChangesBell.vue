<script setup lang="ts">
import type { Appointment, Offer } from "@/types";
import { Bell } from "lucide-vue-next";
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
      type="button"
      class="icon-btn relative rounded-full hover:bg-subtle"
      :aria-label="t('changes.open', { count: changes.unseenCount }, changes.unseenCount)"
      @click="isOpen = true"
    >
      <Bell class="size-[22px]" aria-hidden="true" />
      <span v-if="changes.unseenCount > 0" class="count-badge absolute top-[7px] right-1.5 bg-accent text-on-accent">
        {{ changes.unseenCount > 99 ? "99+" : changes.unseenCount }}
      </span>
    </button>
    <ChangesSheet v-if="isOpen" @open-row="(target) => (toOpen = target)" @after-leave="onAfterLeave" />
    <AppointmentDetailSheet
      v-if="copy?.appointment"
      :appointment="copy.appointment"
      :outcome="copy.outcome"
      @after-leave="copy = null"
    />
    <OfferDetailSheet v-if="copy?.offer" :offer="copy.offer" :outcome="copy.outcome" @after-leave="copy = null" />
  </div>
</template>
