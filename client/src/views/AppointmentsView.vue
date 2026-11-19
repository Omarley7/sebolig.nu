<script setup lang="ts">
import { CalendarDays, ChevronDown, ExternalLink } from "lucide-vue-next";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import AppointmentRow from "~/components/appointment/row/AppointmentRow.vue";
import AppointmentDetailSheet from "~/components/appointment/detail/AppointmentDetailSheet.vue";
import MapModal from "~/components/shared/MapModal.vue";
import EmptyState from "~/components/ui/EmptyState.vue";
import ErrorBanner from "~/components/ui/ErrorBanner.vue";
import FullError from "~/components/ui/FullError.vue";
import PageHeader from "~/components/ui/PageHeader.vue";
import SkeletonRows from "~/components/ui/SkeletonRows.vue";
import TwoPane from "~/components/ui/TwoPane.vue";
import { useAutomaticChecks } from "~/composables/useAutomaticChecks";
import { useDetailSheet } from "~/composables/useDetailSheet";
import { useIsDesktop } from "~/composables/useIsDesktop";
import { useListStatus } from "~/composables/useListStatus";
import { useNow } from "~/composables/useNow";
import { agenda, dateKey } from "~/lib/agenda";
import { appointmentPin } from "~/lib/mapPin";
import { useAppointmentsStore } from "~/stores/appointments";
import { useChangesStore } from "~/stores/changes";

/**
 * Fremvisninger (Q6): one agenda by day with sticky day headers, an "Afventer dato" group, and the
 * past ones in a collapsed "Tidligere". Two panes on desktop.
 */
const store = useAppointmentsStore();
const changes = useChangesStore();
const { t, locale } = useI18n();
const now = useNow();
const isDesktop = useIsDesktop();

useAutomaticChecks(store);
const status = useListStatus(store);

const sections = computed(() => agenda(store.appointments, now.value));
const showPast = ref(false);

const detail = useDetailSheet((id) => store.appointments.find((a) => a.id === id), {
  onOpen: (id) => changes.markSeen("appointment", id),
  inline: () => isDesktop.value,
  fallback: () => sections.value.days[0]?.items[0]?.id ?? sections.value.awaitingDate[0]?.id,
});

const showMap = ref(false);
const pins = computed(() =>
  [...sections.value.days.flatMap((d) => d.items), ...sections.value.awaitingDate]
    .map((a) => appointmentPin(a, t))
    .filter((pin) => pin !== null),
);

const DAY_MS = 86_400_000;
function dayLabel(date: string): { title: string; sub: string } {
  const loc = locale.value === "en" ? "en-GB" : "da-DK";
  const at = new Date(`${date}T12:00:00`);
  const long = at.toLocaleDateString(loc, { weekday: "long", day: "numeric", month: "short" });
  const days = Math.round((at.getTime() - new Date(`${dateKey(now.value)}T12:00:00`).getTime()) / DAY_MS);
  const capital = long.charAt(0).toUpperCase() + long.slice(1);
  if (days === 0) return { title: t("common.today"), sub: long };
  if (days === 1) return { title: t("common.tomorrow"), sub: long };
  return { title: capital, sub: t("appointments.inDays", { count: days }) };
}
</script>

<template>
  <TwoPane :desktop="isDesktop">
    <PageHeader
      :title="t('nav.appointments')"
      :subtitle="status.subtitle"
      :busy="store.isBusy"
      :loading="store.isLoading && !store.hasData"
      :show-map="pins.length > 0"
      @refresh="store.refresh()"
      @map="showMap = true"
    />

    <ErrorBanner v-if="status.banner" :message="t('appointments.refreshFailed')" @retry="store.refresh()" />

    <SkeletonRows v-if="status.skeleton && store.isLoading" />
    <FullError
      v-else-if="status.fullError"
      :title="t('appointments.fetchFailedTitle')"
      :description="t('appointments.refreshFailed')"
      @retry="store.refresh()"
    />
    <EmptyState
      v-else-if="store.hasData && store.appointments.length === 0"
      :icon="CalendarDays"
      :title="t('appointments.emptyTitle')"
      :description="t('appointments.emptyDescription')"
    >
      <a href="https://findbolig.nu" target="_blank" rel="noopener noreferrer" class="btn btn-secondary mt-2">
        {{ t("appointments.searchOnFindbolig") }}
        <ExternalLink class="size-4" aria-hidden="true" />
      </a>
    </EmptyState>

    <template v-else>
      <section v-for="day in sections.days" :key="day.date">
        <h2 class="sticky top-14 lg:top-0 z-[1] flex items-baseline gap-2 px-1 pt-[18px] pb-2 bg-bg text-[17px] font-bold">
          {{ dayLabel(day.date).title }}
          <span class="text-[13px] font-medium text-muted">{{ dayLabel(day.date).sub }}</span>
        </h2>
        <ul class="flex flex-col gap-2">
          <AppointmentRow v-for="a in day.items" :key="a.id" :appointment="a" :selected="detail.paneId === a.id" />
        </ul>
      </section>

      <section v-if="sections.awaitingDate.length">
        <h2 class="sticky top-14 lg:top-0 z-[1] px-1 pt-[18px] pb-2 bg-bg text-[17px] font-bold">{{ t("appointments.noDate") }}</h2>
        <ul class="flex flex-col gap-2">
          <AppointmentRow
            v-for="a in sections.awaitingDate"
            :key="a.id"
            :appointment="a"
            variant="awaiting"
            :selected="detail.paneId === a.id"
          />
        </ul>
      </section>

      <section v-if="sections.past.length" class="mt-5">
        <button
          type="button"
          class="w-full h-12 px-1 flex items-center justify-between border-t border-border text-[15px] font-semibold text-muted"
          :aria-expanded="showPast"
          @click="showPast = !showPast"
        >
          <span>{{ t("appointments.past", { count: sections.past.length }) }}</span>
          <ChevronDown class="size-[18px] transition-transform" :class="{ 'rotate-180': showPast }" aria-hidden="true" />
        </button>
        <ul v-if="showPast" class="flex flex-col gap-2">
          <AppointmentRow v-for="a in sections.past" :key="a.id" :appointment="a" variant="past" :selected="detail.paneId === a.id" />
        </ul>
      </section>
    </template>

    <template #pane>
      <AppointmentDetailSheet v-if="detail.pane" :key="detail.pane.id" inline :appointment="detail.pane" />
    </template>
  </TwoPane>

  <AppointmentDetailSheet
    v-if="!isDesktop && detail.item"
    :appointment="detail.item"
    :gone="detail.gone"
    :section="detail.section"
    @close="detail.onClose"
    @after-leave="detail.onAfterLeave"
  />
  <MapModal v-if="showMap" :pins="pins" :close-on-select="isDesktop" :title="t('nav.appointments')" @select="detail.open" @close="showMap = false" />
</template>
