<script setup lang="ts">
import type { Financials } from "@/types";
import { ChevronRight } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { formatKr, formatRent } from "~/lib/formatters";

/** The rent and what moving in costs, opening the full breakdown (Leje). */
defineProps<{ financials: Financials }>();
const emit = defineEmits<{ open: [] }>();
const { t } = useI18n();
</script>

<template>
  <button type="button" class="card card-link w-full flex items-center gap-3 px-4 py-3.5 text-left" @click="emit('open')">
    <span class="flex-1 flex flex-col gap-0.5">
      <span class="label-caps">{{ t("financials.rent") }}</span>
      <span class="text-[17px] font-bold tabular-nums">{{ formatRent(financials.monthlyRentIncludingAconto, t) }}</span>
    </span>
    <span class="flex flex-col items-end gap-0.5">
      <span class="label-caps">{{ t("financials.firstPayment") }}</span>
      <span class="text-[15px] font-semibold tabular-nums">{{ formatKr(financials.firstPayment) }} kr.</span>
    </span>
    <ChevronRight class="size-[18px] text-muted" aria-hidden="true" />
  </button>
</template>
