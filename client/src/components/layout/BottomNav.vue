<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useNavBadges } from "~/composables/useNavBadges";
import { NAV_ITEMS } from "./navItems";

const { t } = useI18n();
const badges = useNavBadges();
</script>

<template>
  <nav :aria-label="t('nav.main')" class="fixed bottom-0 inset-x-0 z-30 bg-surface border-t border-border safe-bottom">
    <div class="max-w-2xl mx-auto grid grid-cols-4 h-[68px]">
      <router-link
        v-for="item in NAV_ITEMS"
        :key="item.name"
        :to="item.to"
        custom
        v-slot="{ href, navigate, isActive, isExactActive }"
      >
        <a
          :href="href"
          :aria-current="(item.name === 'home' ? isExactActive : isActive) ? 'page' : undefined"
          class="relative flex flex-col items-center justify-center gap-[3px] text-[11px] font-semibold text-muted aria-[current=page]:text-accent aria-[current=page]:font-bold"
          @click="navigate"
        >
          <component
            :is="item.icon"
            class="size-[22px]"
            :stroke-width="(item.name === 'home' ? isExactActive : isActive) ? 2.4 : 2"
            aria-hidden="true"
          />
          {{ t(item.labelKey) }}
          <span
            v-if="badges[item.name]"
            class="count-badge absolute top-[9px] left-[calc(50%+6px)]"
            :class="badges[item.name]!.tone === 'urgent' ? 'bg-danger text-white' : 'bg-muted text-surface'"
          >
            {{ badges[item.name]!.count }}
          </span>
        </a>
      </router-link>
    </div>
  </nav>
</template>
