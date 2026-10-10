<script setup lang="ts">
import type { Appointment } from "@/types";
import { computed, ref, watch } from "vue";
import CompactCard from "./card/CompactCard.vue";
import BaseCollapse from "~/components/Base/BaseCollapse.vue";
import MapModal from "~/components/shared/MapModal.vue";
import { useI18n } from "vue-i18n";
import { useOpenDetail } from "~/composables/useDetailSheet";
import type { MapPin } from "~/lib/mapPin";

const { t } = useI18n();
const openDetail = useOpenDetail();

const props = defineProps<{
  groupKey: string;
  label: string;
  appointments: Appointment[];
  includeDate?: boolean;
  isFirst?: boolean;
  class?: string;
}>();

const showMap = ref(false);
const expanded = ref(props.isFirst ?? false);
const hasBeenExpanded = ref(expanded.value);

watch(expanded, (val) => {
  if (val) hasBeenExpanded.value = true;
});

function toggleExpanded() {
  expanded.value = !expanded.value;
}

const pins = computed<MapPin[]>(() =>
  props.appointments.flatMap(({ id, title, residence }) =>
    residence.location
      ? [{ id, lat: residence.location.latitude, lng: residence.location.longitude, label: residence.addressLine1 ?? title }]
      : [],
  ),
);
</script>

<template>
  <li :class="props.class">
    <!-- Group header -->
    <div class="flex items-center justify-between cursor-pointer" @click="toggleExpanded">
      <div class="flex items-center gap-2">
        <h2 class="text-[clamp(0.95rem,3vw,1.125rem)] font-semibold pl-1">{{ label }}</h2>
        <span v-if="!expanded"
          class="inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-xs font-medium rounded-full dark:bg-white/15 bg-neutral-400/30 dark:text-neutral-300 text-neutral-600">
          {{ props.appointments.length }}
        </span>
      </div>
      <img src="/icons/chevron-down.svg" alt="Expand/Collapse"
        class="size-5 dark:invert opacity-70 transition-transform duration-200" :class="{ '-rotate-90': !expanded }" />
    </div>

    <!-- Inner loop: appointments in this group -->
    <BaseCollapse v-model:expanded="expanded">
      <!-- height:2px;border-width:0;color:gray;background-color:gray" -->
      <hr class="dark:border-zinc-50/25 m-1" />
      <div v-if="props.appointments.length > 1" class="flex flex-col items-center p-1" @click="showMap = true">
        <div
          class="flex flex-row items-center gap-1.5 border rounded-lg dark:border-zinc-50/25 dark:bg-white/5 bg-neutral-200 p-1.5 mb-2 cursor-pointer select-none hover:scale-[1.02] hover:bg-neutral-300 dark:hover:bg-white/10 active:scale-[0.98] transition-all duration-150">
          <p class="text-[clamp(0.8rem,2.5vw,0.925rem)] dark:text-white/50">{{ t('appointments.mapOfLocations', { count: props.appointments.length }) }}</p>
          <img src="/icons/map-pin.svg" alt="Map"
            class="size-5 dark:invert opacity-70" />

        </div>
      </div>
      <ul class="grid grid-cols-1 md:grid-cols-2 gap-1.5 p-1">
        <CompactCard v-for="appointment in props.appointments" :key="appointment.id" :appointment="appointment"
          :include-date="props.includeDate" :load-image="hasBeenExpanded" />
      </ul>
    </BaseCollapse>

    <MapModal v-if="showMap" :pins="pins" @select="openDetail" @close="showMap = false" />
  </li>
</template>
