<script setup lang="ts">
import { CircleCheck, CircleX, Info, TriangleAlert, X } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import type { Toast, ToastType } from "~/stores/toast";
import { useToastStore } from "~/stores/toast";

/** A dark ink snackbar with a coloured icon and a close button. */
const props = defineProps<{ toast: Toast }>();

const toastStore = useToastStore();
const { t } = useI18n();

const icons: Record<ToastType, { icon: unknown; color: string }> = {
  success: { icon: CircleCheck, color: "text-toast-success" },
  warning: { icon: TriangleAlert, color: "text-toast-warning" },
  error: { icon: CircleX, color: "text-toast-error" },
  info: { icon: Info, color: "text-toast-info" },
};
</script>

<template>
  <div
    :role="props.toast.type === 'error' ? 'alert' : 'status'"
    class="w-full max-w-[420px] flex items-center gap-3 pl-4 pr-1 py-1 min-h-[52px] rounded-2xl bg-toast text-on-toast shadow-lg"
  >
    <component :is="icons[toast.type].icon" class="size-5 shrink-0" :class="icons[toast.type].color" aria-hidden="true" />
    <p class="flex-1 py-2 text-sm font-medium leading-snug">{{ toast.message }}</p>
    <button type="button" class="icon-btn !text-on-toast/80 hover:!text-on-toast" :aria-label="t('common.close')" @click="toastStore.dismiss(toast.id)">
      <X class="size-[18px]" aria-hidden="true" />
    </button>
  </div>
</template>
