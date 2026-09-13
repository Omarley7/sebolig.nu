<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, ref } from "vue";
import AppointmentGroup from "~/components/appointment/AppointmentGroup.vue";
import CompactCardSkeleton from "~/components/appointment/card/CompactCardSkeleton.vue";
import EmptyAppointments from "~/components/appointment/EmptyAppointments.vue";
import GroupBySelector from "~/components/appointment/GroupBySelector.vue";
import {
  useGroupAppointments,
  type GroupBy,
} from "~/composables/useGroupAppointments";
import { useAppointmentsStore } from "~/stores/appointments";
const store = useAppointmentsStore();
const { appointments, isLoading } = storeToRefs(store);
const groupBy = ref<GroupBy>("day");
const { groupedAppointments, formatLabel } = useGroupAppointments(
  appointments,
  groupBy,
);
const includeDate = computed(() => groupBy.value !== "day");
</script>
<template>
  <div>
    <div class="flex flex-col gap-3 justify-between items-center mb-2">
      <GroupBySelector class="w-full" v-model="groupBy" />
    </div>

    <!-- Skeleton loading state -->
    <div v-if="isLoading && !appointments.length"
      class="w-full border rounded-xl p-2 dark:border-zinc-50/25 dark:bg-white/5 bg-neutral-200">
      <div class="h-5 w-28 rounded-md mb-2 ml-1 bg-neutral-300/40 dark:bg-white/10" />
      <ul class="grid grid-cols-1 md:grid-cols-2 gap-1.5 p-1">
        <CompactCardSkeleton v-for="i in 4" :key="i" />
      </ul>
    </div>

    <!-- Loaded appointments -->
    <ul v-else class="w-full">
      <AppointmentGroup class="w-full mb-2 border rounded-xl p-1 dark:border-zinc-50/25 dark:bg-white/5 bg-neutral-200"
        v-for="([groupKey, group], index) in groupedAppointments" :key="groupKey" :group-key="groupKey"
        :label="formatLabel(groupKey)" :appointments="group" :include-date="includeDate" :is-first="index === 0" />
    </ul>

    <!-- Empty state (not loading, no results) -->
    <EmptyAppointments v-if="!isLoading && !appointments.length" />
  </div>
</template>