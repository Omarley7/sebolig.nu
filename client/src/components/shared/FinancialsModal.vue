<script setup lang="ts">
import type { Financials } from "@/types";
import { X } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { formatCurrency } from "~/lib/formatters";
import { useScrollLock } from "~/composables/useScrollLock";

const props = defineProps<{
    financials: Financials;
}>();

const emit = defineEmits<{
    close: [];
}>();

const { t } = useI18n();
useScrollLock();

const rows: { key: keyof Financials; suffix?: string; strong?: boolean }[] = [
    { key: "monthlyRentIncludingAconto" as const, suffix: "perMonth", strong: true },
    { key: "monthlyRentExcludingAconto" as const, suffix: "perMonth" },
    { key: "utilityCosts" as const, suffix: "perMonth" },
    { key: "deposit" as const },
    { key: "prepaidRent" as const },
    { key: "firstPayment" as const, strong: true },
];
</script>

<template>
  <Teleport to="body">
    <!-- Leje: a bottom sheet on phones, a centred panel on desktop -->
    <div class="fixed inset-0 z-[70] flex items-end justify-center lg:items-center lg:p-6">
      <div class="absolute inset-0 bg-scrim" @click="emit('close')" />
      <div
        role="dialog"
        aria-modal="true"
        :aria-label="t('financials.rent')"
        class="relative w-full max-w-lg flex flex-col gap-3 px-5 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] rounded-t-[22px] bg-surface shadow-2xl
               lg:rounded-[22px] lg:pb-6"
      >
        <span class="self-center w-10 h-[5px] mt-2.5 rounded-full bg-handle lg:hidden" aria-hidden="true" />
        <div class="flex items-center justify-between gap-2 -mr-2 lg:mt-3">
          <h2 class="text-[21px] font-extrabold tracking-tight">{{ t("financials.rent") }}</h2>
          <button type="button" class="icon-btn rounded-full bg-subtle" :aria-label="t('common.close')" @click="emit('close')">
            <X class="size-[18px]" :stroke-width="2.2" aria-hidden="true" />
          </button>
        </div>
        <dl class="flex flex-col rounded-2xl border border-border overflow-hidden">
          <div
            v-for="row in rows"
            :key="row.key"
            class="flex justify-between gap-3 px-4 py-3 border-b border-divider last:border-0"
            :class="row.strong ? 'bg-bg' : ''"
          >
            <dt class="text-sm" :class="row.strong ? 'font-bold' : 'text-muted'">
              {{ t(`financials.${row.key}`) }}
              <span v-if="row.suffix" class="text-xs text-muted font-normal">({{ t(`financials.${row.suffix}`) }})</span>
            </dt>
            <dd class="text-sm tabular-nums" :class="row.strong ? 'font-extrabold' : 'font-semibold'">{{ formatCurrency(props.financials[row.key]) }}</dd>
          </div>
        </dl>
      </div>
    </div>
  </Teleport>
</template>
