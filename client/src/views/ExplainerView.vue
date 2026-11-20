<script setup lang="ts">
import { CircleHelp, ExternalLink, Lock, ShieldCheck, Smartphone, Undo2, Users } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import { REPO_URL } from "~/config";

const { t } = useI18n();

/** The six approved sections, in order, each a card with an icon tile. Revoking is a numbered list. */
const sections = [
  { key: "password", icon: Lock, paragraphs: ["p1", "p2", "p3"] },
  { key: "notStored", icon: ShieldCheck, paragraphs: ["p1", "p2"] },
  { key: "why", icon: CircleHelp, paragraphs: ["p1"] },
  { key: "revoke", icon: Undo2, paragraphs: ["p1", "p2", "p3"], numbered: true },
  { key: "device", icon: Smartphone, paragraphs: ["p1", "p2", "p3"] },
  { key: "who", icon: Users, paragraphs: ["p1", "p2"] },
] as const;
</script>

<template>
  <article class="max-w-2xl mx-auto pt-7 pb-8 flex flex-col gap-3.5">
    <header class="flex flex-col gap-2.5 px-1 pb-1.5">
      <h1 class="text-[30px] font-extrabold tracking-tight">{{ t("explainer.title") }}</h1>
      <p class="text-base leading-normal text-muted">{{ t("explainer.intro") }}</p>
    </header>

    <section v-for="section in sections" :key="section.key" class="card flex flex-col gap-2.5 p-[18px] rounded-[18px]">
      <div class="flex items-center gap-3">
        <span class="size-10 shrink-0 rounded-xl bg-soft text-soft-ink flex items-center justify-center">
          <component :is="section.icon" class="size-5" aria-hidden="true" />
        </span>
        <h2 class="text-[17px] font-extrabold leading-snug">{{ t(`explainer.${section.key}.title`) }}</h2>
      </div>
      <ol v-if="'numbered' in section" class="flex flex-col gap-2.5">
        <li v-for="(p, i) in section.paragraphs" :key="p" class="flex gap-3">
          <span class="size-[26px] shrink-0 rounded-full bg-accent text-on-accent text-[13px] font-extrabold flex items-center justify-center">{{ i + 1 }}</span>
          <span class="text-[15px] leading-relaxed">{{ t(`explainer.${section.key}.${p}`) }}</span>
        </li>
      </ol>
      <p v-for="p in section.paragraphs" v-else :key="p" class="text-[15px] leading-relaxed">{{ t(`explainer.${section.key}.${p}`) }}</p>
    </section>

    <a :href="REPO_URL" target="_blank" rel="noopener noreferrer" class="self-start min-h-11 flex items-center gap-1.5 px-1 text-sm font-semibold text-accent">
      {{ t("common.sourceCode") }}
      <ExternalLink class="size-3.5" aria-hidden="true" />
    </a>
  </article>
</template>
