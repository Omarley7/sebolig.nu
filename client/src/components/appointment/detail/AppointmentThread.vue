<script setup lang="ts">
import type { ThreadMessage } from "@/types";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import BaseCollapse from "~/components/Base/BaseCollapse.vue";
import ThreadMessageItem from "~/components/appointment/detail/ThreadMessageItem.vue";

const { t } = useI18n();

const props = defineProps<{
  /** Oldest first. */
  messages: ThreadMessage[];
  /** findbolig.nu's page for the offer, where its thread is answered; null when there is none. */
  replyUrl: string | null;
}>();

// Only the latest message shows; the earlier ones unfold above it.
const latest = computed(() => props.messages[props.messages.length - 1]);
const earlier = computed(() => props.messages.slice(0, -1));
const showEarlier = ref(false);
</script>

<template>
  <section>
    <p class="text-xs font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-2">
      {{ t("appointments.thread.title") }}
    </p>

    <template v-if="earlier.length">
      <button
        type="button"
        class="flex items-center gap-1 mb-2 text-xs font-medium text-neutral-500 dark:text-neutral-400
               hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
        :aria-expanded="showEarlier"
        @click="showEarlier = !showEarlier"
      >
        <img
          src="/icons/chevron-down.svg"
          alt=""
          class="size-3.5 opacity-50 dark:invert transition-transform"
          :class="{ 'rotate-180': showEarlier }"
        />
        {{ showEarlier ? t("appointments.thread.hideEarlier") : t("appointments.thread.showEarlier", earlier.length) }}
      </button>

      <BaseCollapse v-model:expanded="showEarlier">
        <ol class="space-y-2 pb-2">
          <ThreadMessageItem v-for="(message, i) in earlier" :key="i" :message="message" />
        </ol>
      </BaseCollapse>
    </template>

    <ol>
      <ThreadMessageItem :message="latest" />
    </ol>

    <a
      v-if="replyUrl"
      :href="replyUrl"
      target="_blank"
      rel="noopener noreferrer"
      class="mt-2 w-full flex items-center justify-center gap-2 p-3 rounded-xl
             border border-neutral-200 dark:border-neutral-700/50
             hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors"
    >
      <img src="/icons/external-link.svg" alt="" class="size-4 opacity-50 dark:invert" />
      <span class="text-sm font-medium text-neutral-600 dark:text-neutral-300">
        {{ t("appointments.thread.reply") }}
      </span>
    </a>
  </section>
</template>
