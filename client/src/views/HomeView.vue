<script setup lang="ts">
import { CalendarDays, Inbox, MessageSquare } from "lucide-vue-next";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import LandingSection from "~/components/LandingSection.vue";
import NextViewingCard from "~/components/home/NextViewingCard.vue";
import ErrorBanner from "~/components/ui/ErrorBanner.vue";
import PageHeader from "~/components/ui/PageHeader.vue";
import RowPhoto from "~/components/ui/RowPhoto.vue";
import { useAuth } from "~/composables/useAuth";
import { useAutomaticChecks } from "~/composables/useAutomaticChecks";
import { useNow } from "~/composables/useNow";
import { nextViewing } from "~/lib/agenda";
import { changeText } from "~/lib/changeText";
import { formatRent, formatSentAt } from "~/lib/formatters";
import { chipClasses, offerChip } from "~/lib/offerChip";
import { offerTabs } from "~/lib/offerTabs";
import { updatedAgo } from "~/lib/relativeTime";
import { useAppointmentsStore } from "~/stores/appointments";
import { useChangesStore } from "~/stores/changes";
import { useOffersStore } from "~/stores/offers";
import { useWaitingListsStore } from "~/stores/waitingLists";

/**
 * Hjem (Q8, Q9, Q25): a page of things to do. The next viewing, the offers to answer, and the new
 * messages from the changes store, with one button that refreshes everything.
 */
const auth = useAuth();
const appointments = useAppointmentsStore();
const offers = useOffersStore();
const waitingLists = useWaitingListsStore();
const changes = useChangesStore();
const router = useRouter();
const { t, locale } = useI18n();
const now = useNow();

// Landing only for someone with no Connection and nothing on the device. Reactive: a
// Connection that ends erases Local data, and the connect form shows right away.
const showLanding = computed(
  () => !auth.isAuthenticated && !appointments.hasData && !offers.hasData && !waitingLists.hasData,
);

// Each store shows what is stored, and only checks findbolig.nu when there is a Connection.
useAutomaticChecks(appointments, offers, waitingLists);

const stores = [appointments, offers, waitingLists];
const busy = computed(() => stores.some((s) => s.isBusy));
const failed = computed(() => stores.some((s) => s.hasData && s.status === "error"));

function refreshAll() {
  for (const store of stores) void store.refresh();
}

const firstName = computed(() => auth.name?.split(" ")[0] || "");
// The oldest of the lists' last checks: everything is at least this fresh.
const subtitle = computed(() => {
  if (busy.value && !appointments.hasData) return t("common.fetching");
  const times = stores.map((s) => s.checkedAt ?? s.updatedAt).filter((d): d is Date => d !== null);
  if (times.length === 0) return t("common.notFetchedYet");
  const oldest = new Date(Math.min(...times.map((d) => d.getTime())));
  return t("home.updated", { ago: updatedAgo(oldest, now.value, t) });
});

const next = computed(() => nextViewing(appointments.appointments, now.value));
const toAnswer = computed(() => offerTabs(offers.offers, [], now.value).open);
const messages = computed(() => changes.unseenMessages);

const open = (page: "appointments" | "offers", id: string) => router.push({ name: page, query: { open: id } });
</script>

<template>
  <LandingSection v-if="showLanding" />

  <div v-else class="lg:max-w-[1100px]">
    <PageHeader
      :title="firstName ? t('home.hello', { name: firstName }) : t('home.helloAnonymous')"
      :subtitle="subtitle"
      :busy="busy"
      :loading="stores.some((s) => s.isLoading && !s.hasData)"
      @refresh="refreshAll"
    />
    <ErrorBanner v-if="failed" :message="t('home.refreshFailed')" @retry="refreshAll" />

    <!-- Phone: next, to answer, messages. Desktop: next and messages on the left, to answer on the right. -->
    <div class="mt-5 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2 lg:items-start">
      <!-- Næste fremvisning -->
      <section class="flex flex-col gap-2.5 lg:col-start-1 lg:row-start-1" aria-labelledby="home-next">
        <div class="flex items-baseline justify-between px-1">
          <h2 id="home-next" class="text-[17px] font-bold">{{ t("home.nextViewing") }}</h2>
          <router-link to="/appointments" class="py-2.5 text-sm font-semibold text-accent">{{ t("home.allViewings") }}</router-link>
        </div>
        <NextViewingCard v-if="next" :appointment="next" @open="open('appointments', next.id)" />
        <p v-else class="card flex items-center gap-3 px-4 py-4 text-sm text-muted">
          <CalendarDays class="size-5 shrink-0" aria-hidden="true" />
          {{ appointments.hasData ? t("home.noNextViewing") : t("common.notFetchedYet") }}
        </p>
      </section>

      <!-- Skal besvares -->
      <section class="flex flex-col gap-2.5 lg:col-start-2 lg:row-start-1 lg:row-span-2" aria-labelledby="home-to-answer">
        <div class="flex items-baseline justify-between px-1">
          <h2 id="home-to-answer" class="text-[17px] font-bold">
            {{ t("home.toAnswer") }}
            <span v-if="toAnswer.length" class="text-sm font-semibold text-muted">{{ toAnswer.length }}</span>
          </h2>
          <router-link to="/offers" class="py-2.5 text-sm font-semibold text-accent">{{ t("home.allOffers") }}</router-link>
        </div>
        <ul v-if="toAnswer.length" class="card overflow-hidden">
          <li v-for="row in toAnswer" :key="row.offer.id" class="border-b border-divider last:border-0">
            <button type="button" class="w-full flex items-center gap-3 px-3.5 py-3 text-left hover:bg-subtle" @click="open('offers', row.offer.id)">
              <RowPhoto :src="row.offer.imageUrl" />
              <span class="flex-1 min-w-0 flex flex-col gap-0.5">
                <span class="text-[15px] font-semibold truncate">{{ row.offer.residence.addressLine1 }}</span>
                <span class="text-[13px] text-muted">
                  {{
                    [
                      row.offer.rooms != null ? t("common.roomsShort", { count: row.offer.rooms }) : null,
                      row.offer.area != null ? t("offers.area", { value: row.offer.area }) : null,
                      formatRent(row.offer.financials.monthlyRentIncludingAconto, t),
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  }}
                </span>
              </span>
              <span class="chip !py-[5px]" :class="chipClasses[offerChip(row, t, locale).tone]">{{ offerChip(row, t, locale).label }}</span>
            </button>
          </li>
        </ul>
        <p v-else class="card flex items-center gap-3 px-4 py-4 text-sm text-muted">
          <Inbox class="size-5 shrink-0" aria-hidden="true" />
          {{ offers.hasData ? t("home.nothingToAnswer") : t("common.notFetchedYet") }}
        </p>
      </section>

      <!-- Nye beskeder -->
      <section class="flex flex-col gap-2.5 lg:col-start-1 lg:row-start-2" aria-labelledby="home-messages">
        <div class="flex items-baseline justify-between px-1">
          <h2 id="home-messages" class="text-[17px] font-bold">
            {{ t("home.newMessages") }}
            <span v-if="messages.length" class="text-sm font-semibold text-muted">{{ messages.length }}</span>
          </h2>
        </div>
        <ul v-if="messages.length" class="flex flex-col gap-2">
          <li v-for="change in messages" :key="change.id">
            <button
              type="button"
              class="card card-link w-full flex flex-col gap-1.5 px-4 py-3.5 text-left"
              @click="open('appointments', change.itemId)"
            >
              <span class="flex justify-between gap-2 text-[13px] text-muted">
                <span class="min-w-0 truncate">
                  <strong class="font-semibold text-ink">{{ changeText(change, t).text }}</strong>
                  · {{ change.card.addressLine1 }}
                </span>
                <span class="shrink-0 tabular-nums">{{ formatSentAt(change.at) }}</span>
              </span>
              <span v-if="changeText(change, t).quote" class="text-sm leading-[1.45] line-clamp-3">{{ changeText(change, t).quote }}</span>
            </button>
          </li>
        </ul>
        <p v-else class="card flex items-center gap-3 px-4 py-4 text-sm text-muted">
          <MessageSquare class="size-5 shrink-0" aria-hidden="true" />
          {{ t("home.noNewMessages") }}
        </p>
      </section>
    </div>
  </div>
</template>
