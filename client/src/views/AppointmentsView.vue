<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import AppointmentsList from "~/components/appointment/AppointmentsList.vue";
import { useAppointmentsStore } from "~/stores/appointments";

const store = useAppointmentsStore();
const { t } = useI18n();

const appointmentCount = computed(() => store.appointments.length);

onMounted(() => store.init());
</script>

<template>
  <div>
    <div class="mb-3 flex items-center justify-between">
      <p class="text-xl font-semibold tracking-tight dark:text-white flex items-baseline gap-2">
        {{ t("appointments.pageTitle") }}
        <span
          v-if="appointmentCount > 0"
          class="text-xs font-normal text-neutral-400 dark:text-neutral-500"
        >
          {{ t("appointments.count", { count: appointmentCount }) }}
        </span>
      </p>
      <button
        @click="store.refresh()"
        :disabled="store.isLoading"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5 disabled:opacity-40 transition-colors"
      >
        <img
          src="/icons/refresh-ccw.svg"
          alt=""
          class="size-4 dark:invert opacity-60"
          :class="{ 'animate-spin': store.isLoading }"
        />
        {{ t("appointments.refresh") }}
      </button>
    </div>
    <AppointmentsList />
  </div>
</template>
