<script setup lang="ts">
import type { ThreadMessage } from "@/types";
import { useI18n } from "vue-i18n";
import { formatSentAt } from "~/lib/formatters";
import { senderLabel, withLinks } from "~/lib/thread";

const { t } = useI18n();

defineProps<{
  /** Oldest first. */
  messages: ThreadMessage[];
  /** findbolig.nu's page for the offer, where its thread is answered; null when there is none. */
  replyUrl: string | null;
}>();
</script>

<template>
  <section>
    <p class="text-xs font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-2">
      {{ t("appointments.thread.title") }}
    </p>

    <ol class="space-y-2">
      <li
        v-for="(message, i) in messages"
        :key="i"
        class="p-3 rounded-xl"
        :class="message.from === 'you'
          ? 'bg-neutral-200/70 dark:bg-white/10 ml-6'
          : 'bg-neutral-100 dark:bg-white/5'"
      >
        <div class="flex items-baseline justify-between gap-2 mb-1">
          <p class="text-xs font-semibold truncate text-neutral-700 dark:text-neutral-200">
            {{ senderLabel(message, t) }}
          </p>
          <p class="text-xs tabular-nums shrink-0 text-neutral-400 dark:text-neutral-500">
            {{ formatSentAt(message.sentAt) }}
          </p>
        </div>
        <p class="text-sm whitespace-pre-line break-words text-neutral-700 dark:text-neutral-300">
          <template v-for="(part, j) in withLinks(message.body)" :key="j">
            <a
              v-if="part.href"
              :href="part.href"
              target="_blank"
              rel="noopener noreferrer"
            >{{ part.text }}</a>
            <template v-else>{{ part.text }}</template>
          </template>
        </p>
        <p v-if="message.hasAttachments" class="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
          {{ t("appointments.thread.attachment") }}
        </p>
      </li>
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
