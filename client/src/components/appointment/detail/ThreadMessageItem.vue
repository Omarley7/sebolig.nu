<script setup lang="ts">
import type { ThreadMessage } from "@/types";
import { useI18n } from "vue-i18n";
import { formatSentAt } from "~/lib/formatters";
import { senderLabel, withLinks } from "~/lib/thread";

const { t } = useI18n();

defineProps<{ message: ThreadMessage }>();
</script>

<template>
  <li class="flex flex-col gap-1.5 px-3.5 py-3 rounded-[14px]" :class="message.from === 'you' ? 'bg-soft ml-6' : 'bg-bg'">
    <span class="flex justify-between gap-2 text-xs">
      <span class="font-bold truncate">{{ senderLabel(message, t) }}</span>
      <span class="shrink-0 tabular-nums text-muted">{{ formatSentAt(message.sentAt) }}</span>
    </span>
    <p class="text-sm leading-[1.45] whitespace-pre-line break-words">
      <template v-for="(part, j) in withLinks(message.body)" :key="j">
        <a v-if="part.href" :href="part.href" target="_blank" rel="noopener noreferrer" class="text-accent underline">{{ part.text }}</a>
        <template v-else>{{ part.text }}</template>
      </template>
    </p>
    <p v-if="message.hasAttachments" class="text-xs text-muted">{{ t("appointments.thread.attachment") }}</p>
  </li>
</template>
