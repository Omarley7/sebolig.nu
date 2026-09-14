<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import AppointmentsList from "~/components/appointment/AppointmentsList.vue";
import StaleDataBanner from "~/components/StaleDataBanner.vue";
import { useAuth } from "~/composables/useAuth";
import { getCacheAge } from "~/data/appointments";
import { useAppointmentsStore } from "~/stores/appointments";

const store = useAppointmentsStore();
const auth = useAuth();
const router = useRouter();
const { t } = useI18n();

const appointmentCount = computed(() => store.appointments.length);

onMounted(() => {
    const hasCache = getCacheAge() !== null;

    // Only redirect if not authenticated AND no cached data to show
    if (!auth.isAuthenticated && !hasCache) {
        router.replace("/");
        return;
    }

    store.init();
});

function handleOpenLogin() {
    auth.showLoginModal = true;
}
</script>

<template>
    <div>
        <p class="mb-3 text-xl font-semibold tracking-tight dark:text-white flex items-baseline gap-2">
            {{ t("appointments.pageTitle") }}
            <span v-if="appointmentCount > 0" class="text-xs font-normal text-neutral-400 dark:text-neutral-500">
                {{ t("appointments.count", { count: appointmentCount }) }}
            </span>
        </p>
        <StaleDataBanner @open-login="handleOpenLogin" />
        <AppointmentsList />
    </div>
</template>
