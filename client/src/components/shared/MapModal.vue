<script setup lang="ts">
import type { Appointment } from "@/types";
import { ref, onMounted, onUnmounted, nextTick, computed } from "vue";
import L from "leaflet";
import { useHistoryLayer } from "~/composables/useHistoryLayer";
import { useScrollLock } from "~/composables/useScrollLock";

const props = defineProps<{
  appointments: Appointment[];
}>();

const emit = defineEmits<{
  close: [];
}>();

useScrollLock();

// Back and Esc close the map without leaving the route
const layer = useHistoryLayer({ onClose: () => emit("close") });

const mapContainer = ref<HTMLDivElement>();
let map: L.Map | null = null;

const locations = computed(() =>
  props.appointments
    .filter((a) => a.residence.location != null)
    .map((a) => ({
      lat: a.residence.location!.latitude,
      lng: a.residence.location!.longitude,
      label: a.residence.addressLine1 ?? a.title,
    }))
);

function initMap() {
  if (!mapContainer.value || locations.value.length === 0) return;

  map = L.map(mapContainer.value, { zoomControl: true });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);

  const pinIcon = L.icon({
    iconUrl: "/leaflet/marker-icon.png",
    iconRetinaUrl: "/leaflet/marker-icon-2x.png",
    shadowUrl: "/leaflet/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });

  const bounds = L.latLngBounds([]);

  for (const loc of locations.value) {
    const marker = L.marker([loc.lat, loc.lng], { icon: pinIcon }).addTo(map);
    marker.bindPopup(`<strong>${loc.label}</strong>`);
    bounds.extend([loc.lat, loc.lng]);
  }

  if (locations.value.length === 1) {
    map.setView([locations.value[0].lat, locations.value[0].lng], 15);
  } else {
    map.fitBounds(bounds, { padding: [40, 40] });
  }
}

onMounted(async () => {
  layer.open();
  await nextTick();
  initMap();
});

onUnmounted(() => {
  if (map) {
    map.remove();
    map = null;
  }
});
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80" @click.self="layer.close()">
      <div
        class="relative w-[92vw] max-w-2xl h-[70vh] rounded-xl bg-white dark:bg-neutral-900 shadow-xl flex flex-col overflow-hidden">
        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-700/50">
          <h2 class="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{{ $t("common.map") }}</h2>
          <button class="p-1 rounded-full bg-gray-200 hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 transition-colors" @click="layer.close()">
            <img src="/icons/x.svg" alt="Close" class="size-5 dark:invert" />
          </button>
        </div>

        <!-- Map -->
        <div ref="mapContainer" class="flex-1 min-h-0" />

        <!-- Fallback when no locations -->
        <div v-if="locations.length === 0"
          class="absolute inset-0 flex items-center justify-center text-neutral-500 dark:text-neutral-400 text-sm pointer-events-none">
          Ingen lokationer tilgængelige
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style>
@import "leaflet/dist/leaflet.css";
</style>
