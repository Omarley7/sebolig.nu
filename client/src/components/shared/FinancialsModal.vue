<script setup lang="ts">
import type { Financials } from "@/types";
import { onMounted, onUnmounted } from "vue";
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

const rows = [
    { key: "monthlyRentIncludingAconto" as const, suffix: "perMonth" },
    { key: "monthlyRentExcludingAconto" as const, suffix: "perMonth" },
    { key: "utilityCosts" as const, suffix: "perMonth" },
    { key: "deposit" as const },
    { key: "prepaidRent" as const },
    { key: "firstPayment" as const },
];

function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") emit("close");
}

onMounted(() => {
    window.addEventListener("keydown", onKeydown);
});
onUnmounted(() => {
    window.removeEventListener("keydown", onKeydown);
});
</script>

<template>
    <Teleport to="body">
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80" @click.self="emit('close')">
            <div class="relative w-[90vw] max-w-md rounded-xl bg-white dark:bg-neutral-900 p-6 shadow-xl text-neutral-900 dark:text-neutral-100">
                <!-- Close button -->
                <button class="absolute top-3 right-3 p-1 rounded-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 transition-colors"
                    @click="emit('close')">
                    <img src="/icons/x.svg" alt="Close"
                        class="size-5 dark:invert" />
                </button>

                <h2 class="text-lg font-semibold mb-4">{{ t("financials.rent") }}</h2>

                <table class="w-full text-sm">
                    <tbody>
                        <tr v-for="row in rows" :key="row.key" class="border-b border-neutral-200 dark:border-neutral-700/50 last:border-0">
                            <td class="py-2 pr-4 text-neutral-500 dark:text-neutral-400">
                                {{ t(`financials.${row.key}`) }}
                                <span v-if="row.suffix" class="text-neutral-400 dark:text-neutral-500 text-xs">
                                    ({{ t(`financials.${row.suffix}`) }})
                                </span>
                            </td>
                            <td class="py-2 text-right font-medium tabular-nums">
                                {{ formatCurrency(props.financials[row.key]) }}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </Teleport>
</template>
