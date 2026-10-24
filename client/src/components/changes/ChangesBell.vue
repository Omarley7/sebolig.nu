<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import type { Change } from "~/localData/changes";
import { useChangesStore } from "~/stores/changes";
import ChangesSheet from "./ChangesSheet.vue";

const { t } = useI18n();
const changes = useChangesStore();
const route = useRoute();
const router = useRouter();

const isOpen = ref(false);
// The card to open once the panel has slid out and given back its history entry.
let toOpen: Change | null = null;

/** Opens the card's detail sheet on its list's page, through the list's `?open=` link. */
async function onAfterLeave() {
  isOpen.value = false;
  const change = toOpen;
  toOpen = null;
  if (!change) return;
  const name = change.kind === "appointment" ? "appointments" : "offers";
  const target = { name, query: { open: change.itemId } };
  // On the list's own page already: no extra step back to the same page.
  await (route.name === name ? router.replace(target) : router.push(target));
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
    <ChangesSheet v-if="isOpen" @open-card="(change) => (toOpen = change)" @after-leave="onAfterLeave" />
  </div>
</template>
