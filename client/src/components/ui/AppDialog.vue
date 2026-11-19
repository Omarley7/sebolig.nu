<script setup lang="ts">
import { Clock } from "lucide-vue-next";
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useScrollLock } from "~/composables/useScrollLock";

/**
 * A centred alert dialog: Annullér and a confirm button. Answers that can still be changed
 * confirm with the accent; what can't be undone confirms in red (`danger`).
 */
const props = defineProps<{
  title: string;
  body?: string;
  /** A tinted note under the body, such as "you can change your answer until the deadline". */
  note?: string;
  confirmLabel: string;
  danger?: boolean;
  loading?: boolean;
}>();

const emit = defineEmits<{ confirm: []; cancel: [] }>();
const { t } = useI18n();
useScrollLock();

const cancelEl = ref<HTMLButtonElement | null>(null);
onMounted(() => cancelEl.value?.focus());

function cancel() {
  if (!props.loading) emit("cancel");
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[70] flex items-center justify-center p-5">
      <div class="absolute inset-0 bg-scrim" @click="cancel" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        class="relative w-full max-w-sm flex flex-col gap-3.5 rounded-[22px] bg-surface p-5 pt-[22px] shadow-2xl"
      >
        <h2 id="app-dialog-title" class="text-xl font-extrabold tracking-tight leading-tight">{{ title }}</h2>
        <p v-if="body" class="text-[15px] leading-normal">{{ body }}</p>
        <slot />
        <p v-if="note" class="flex gap-2 rounded-xl bg-bg px-3 py-2.5 text-[13px] leading-snug text-muted">
          <Clock class="size-4 shrink-0 mt-px" aria-hidden="true" />
          {{ note }}
        </p>
        <div class="mt-1 grid grid-cols-2 gap-2">
          <button ref="cancelEl" type="button" class="btn btn-secondary btn-lg !text-[15px]" :disabled="loading" @click="cancel">
            {{ t("common.cancel") }}
          </button>
          <button
            type="button"
            class="btn btn-lg !text-[15px]"
            :class="danger ? 'btn-danger' : 'btn-primary'"
            :disabled="loading"
            @click="emit('confirm')"
          >
            <span v-if="loading" class="size-4 rounded-full border-2 border-current/30 border-t-current animate-spin" />
            <span v-else>{{ confirmLabel }}</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
