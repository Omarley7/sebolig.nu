<script setup lang="ts">
import type { Residence } from "@/types";
import { MapPin } from "lucide-vue-next";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { formatPlaceFacts } from "~/lib/formatters";

/** A detail's address, rooms and size, and its postcode linking to the map. */
const props = defineProps<{ residence: Residence; rooms: number | null; area: number | null; company?: string | null }>();
const { t } = useI18n();

const facts = computed(() => formatPlaceFacts({ addressLine2: null, rooms: props.rooms, area: props.area }, t));
const mapUrl = computed(
  () =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      [props.residence.addressLine1, props.residence.addressLine2].filter(Boolean).join(", "),
    )}`,
);
</script>

<template>
  <div class="flex flex-col gap-1">
    <h2 class="text-[21px] font-extrabold tracking-tight leading-tight pr-10 lg:pr-0">{{ residence.addressLine1 }}</h2>
    <span v-if="facts" class="text-sm font-semibold">{{ facts }}</span>
    <a :href="mapUrl" target="_blank" rel="noopener noreferrer" class="self-start min-h-11 flex items-center gap-1.5 text-sm text-muted">
      {{ residence.addressLine2 }}
      <MapPin class="size-3.5" aria-hidden="true" />
      <span class="font-semibold text-accent">{{ t("common.showOnMap") }}</span>
    </a>
    <span v-if="company" class="text-[13px] text-muted">{{ t("offers.rentedOutBy", { company }) }}</span>
  </div>
</template>
