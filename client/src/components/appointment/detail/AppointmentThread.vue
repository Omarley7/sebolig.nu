<script setup lang="ts">
import type { ThreadMessage } from "@/types";
import { ExternalLink } from "lucide-vue-next";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import BaseCollapse from "~/components/Base/BaseCollapse.vue";
import ThreadMessageItem from "~/components/appointment/detail/ThreadMessageItem.vue";

const { t } = useI18n();

const props = defineProps<{
  /** Oldest first. */
  messages: ThreadMessage[];
  /** findbolig.nu's page for answering the thread; null when there is none. */
  replyUrl: string | null;
}>();

// Only the latest message shows; the earlier ones unfold above it.
const latest = computed(() => props.messages[props.messages.length - 1]);
const earlier = computed(() => props.messages.slice(0, -1));
const showEarlier = ref(false);
</script>

<template>
  <section class="flex flex-col gap-2.5">
    <div class="flex items-center justify-between">
      <h3 class="text-base font-bold">{{ t("appointments.thread.title") }}</h3>
      <button
        v-if="earlier.length"
        type="button"
        class="min-h-11 text-[13px] font-semibold text-accent"
        :aria-expanded="showEarlier"
        @click="showEarlier = !showEarlier"
      >
        {{ showEarlier ? t("appointments.thread.hideEarlier") : t("appointments.thread.showEarlier", earlier.length) }}
      </button>
    </div>

    <BaseCollapse v-if="earlier.length" v-model:expanded="showEarlier">
      <ol class="flex flex-col gap-2 pb-2">
        <ThreadMessageItem v-for="(message, i) in earlier" :key="i" :message="message" />
      </ol>
    </BaseCollapse>

    <ol>
      <ThreadMessageItem :message="latest" />
    </ol>

    <a
      v-if="replyUrl"
      :href="replyUrl"
      target="_blank"
      rel="noopener noreferrer"
      class="self-start min-h-11 flex items-center gap-1.5 text-sm font-semibold text-accent"
    >
      {{ t("appointments.thread.reply") }}
      <ExternalLink class="size-3.5" aria-hidden="true" />
    </a>
  </section>
</template>
