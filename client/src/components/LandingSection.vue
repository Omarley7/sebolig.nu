<script setup lang="ts">
import { CalendarDays, Clock, Image as ImageIcon, MessageSquare, Sparkles } from "lucide-vue-next";
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import ConnectForm from "~/components/ConnectForm.vue";
import DemoLoginButton from "~/components/DemoLoginButton.vue";
import { useAuth } from "~/composables/useAuth";
import { REPO_URL } from "~/config";

/**
 * The landing page (Q12): "Prøv demoen" is the main button; the connect form opens behind a
 * second one. A static mock of the app replaces the video.
 */
const { t } = useI18n();
const auth = useAuth();
// An ended Connection explains itself in the form, so it starts open.
const showForm = ref(auth.endedByPasswordChange);

const features = [
  { icon: CalendarDays, key: "landing.featureAppointments" },
  { icon: Clock, key: "landing.featureDeadlines" },
  { icon: Sparkles, key: "landing.featureAI" },
];
</script>

<template>
  <div class="w-full max-w-[1080px] mx-auto px-5 pt-8 pb-7 lg:px-12 lg:pt-16 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:gap-[72px] lg:items-start">
    <div class="flex flex-col gap-6 lg:gap-7">
      <div class="flex flex-col gap-3 lg:gap-3.5">
        <h1 class="text-[30px] leading-[1.12] font-extrabold tracking-tight lg:text-[46px] lg:leading-[1.08]">{{ t("landing.headline") }}</h1>
        <p class="text-base leading-normal text-muted lg:text-lg lg:max-w-[520px]">{{ t("landing.description") }}</p>
      </div>

      <div class="flex flex-col gap-2.5 lg:max-w-[420px]">
        <DemoLoginButton :disabled="auth.isLoading" />
        <div v-if="showForm" class="card p-4">
          <ConnectForm />
        </div>
        <button v-else type="button" class="btn btn-secondary btn-lg !font-semibold" @click="showForm = true">
          {{ t("landing.connectFindbolig") }}
        </button>
      </div>

      <!-- The mock sits here on phones, beside the copy on desktop -->
      <div class="lg:hidden"><LandingMock /></div>

      <ul class="flex flex-col gap-3 lg:gap-3.5">
        <li v-for="feature in features" :key="feature.key" class="flex items-center gap-3 text-[15px] leading-snug">
          <span class="size-9 shrink-0 rounded-[10px] bg-soft text-soft-ink flex items-center justify-center">
            <component :is="feature.icon" class="size-[18px]" aria-hidden="true" />
          </span>
          {{ t(feature.key) }}
        </li>
      </ul>

      <!-- The connect form says this itself once it is open -->
      <p v-if="!showForm" class="mt-2 text-xs leading-normal text-muted">
        {{ t("footer.notAffiliated") }}
        <a :href="REPO_URL" target="_blank" rel="noopener noreferrer" class="font-semibold text-accent">{{ t("common.sourceCode") }}</a>
      </p>
    </div>

    <div class="hidden lg:block pt-2"><LandingMock /></div>
  </div>
</template>

<script lang="ts">
import { defineComponent, h } from "vue";
import i18n from "~/i18n";

/** A static picture of the app: a viewing, an offer to answer and a message from the landlord. Decorative. */
const LandingMock = defineComponent({
  setup() {
    const { t } = i18n.global;
    const tile = (size: string) =>
      h("span", { class: `${size} shrink-0 rounded-[10px] bg-soft text-soft-ink flex items-center justify-center` }, [h(ImageIcon, { class: "size-5" })]);
    return () =>
      h("div", { "aria-hidden": "true", class: "flex flex-col gap-2 p-3.5 rounded-[20px] bg-soft" }, [
        h("div", { class: "flex gap-3 items-center px-3 py-2.5 rounded-[14px] bg-surface" }, [
          h("div", { class: "w-12 shrink-0 flex flex-col tabular-nums" }, [
            h("span", { class: "text-[15px] font-extrabold" }, "15:00"),
            h("span", { class: "text-xs text-muted" }, t("common.today")),
          ]),
          h("div", { class: "flex-1 min-w-0 flex flex-col gap-0.5" }, [
            h("span", { class: "text-sm font-bold truncate" }, "Philip Schous Vej 21, 3. th."),
            h("span", { class: "text-xs text-muted" }, t("landing.mockFacts")),
          ]),
          tile("size-11"),
        ]),
        h("div", { class: "flex gap-3 items-center px-3 py-2.5 rounded-[14px] bg-surface" }, [
          tile("size-11"),
          h("span", { class: "flex-1 text-sm font-bold truncate" }, "Nitivej 6, 2. tv"),
          h("span", { class: "chip !py-[5px] bg-urgent text-urgent-ink" }, t("offers.answerBy", { when: t("offers.tomorrow") })),
        ]),
        h("div", { class: "flex gap-2.5 items-center px-3 py-2.5 rounded-[14px] bg-surface text-[13px] text-muted" }, [
          h(MessageSquare, { class: "size-4 text-soft-ink shrink-0" }),
          h("span", { class: "flex-1 truncate" }, [h("strong", { class: "text-ink font-semibold" }, `${t("appointments.thread.landlord")}: `), t("landing.mockMessage")]),
        ]),
      ]);
  },
});
</script>
