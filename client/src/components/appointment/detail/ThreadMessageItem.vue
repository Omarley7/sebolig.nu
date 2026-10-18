<script setup lang="ts">
import type { ThreadMessage } from "@/types";
import { useI18n } from "vue-i18n";
import { formatSentAt } from "~/lib/formatters";
import { senderLabel, withLinks } from "~/lib/thread";

const { t } = useI18n();

defineProps<{ message: ThreadMessage }>();
</script>

<template>
  <li
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
</template>
