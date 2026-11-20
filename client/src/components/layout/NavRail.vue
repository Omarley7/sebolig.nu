<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import AccountMenu from "~/components/account/AccountMenu.vue";
import UserAvatar from "~/components/account/UserAvatar.vue";
import { useAuth } from "~/composables/useAuth";
import { useNavBadges } from "~/composables/useNavBadges";
import AppLogo from "./AppLogo.vue";
import { NAV_ITEMS } from "./navItems";

const { t } = useI18n();
const badges = useNavBadges();
const auth = useAuth();
const menuOpen = ref(false);
</script>

<template>
  <!-- From lg up the rail replaces the bottom nav (Q14): logo, the four sections, the account at the bottom. -->
  <aside class="sticky top-0 h-dvh w-[232px] shrink-0 flex flex-col gap-6 px-3 py-5 bg-surface border-r border-border">
    <router-link to="/" class="px-3 py-1 self-start rounded-lg"><AppLogo /></router-link>
    <nav :aria-label="t('nav.main')" class="flex flex-col gap-1">
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
          class="flex items-center gap-3 min-h-11 px-3 rounded-xl text-[15px] font-semibold text-muted hover:bg-subtle hover:text-ink
                 aria-[current=page]:bg-soft aria-[current=page]:text-soft-ink aria-[current=page]:font-bold"
          @click="navigate"
        >
          <component :is="item.icon" class="size-5" aria-hidden="true" />
          <span class="flex-1">{{ t(item.labelKey) }}</span>
          <span
            v-if="badges[item.name]"
            class="count-badge !min-w-5 !h-5 !text-[11px]"
            :class="badges[item.name]!.tone === 'urgent' ? 'bg-danger text-white' : 'bg-muted text-surface'"
          >
            {{ badges[item.name]!.count }}
          </span>
        </a>
      </router-link>
    </nav>
    <button
      type="button"
      class="mt-auto flex items-center gap-3 min-h-12 px-2 rounded-xl text-left hover:bg-subtle"
      :aria-label="t('account.open')"
      @click="menuOpen = true"
    >
      <UserAvatar />
      <span class="flex flex-col min-w-0">
        <span class="text-sm font-bold truncate">{{ auth.name || t("account.anonymous") }}</span>
        <span class="text-xs text-muted truncate">{{ auth.isDemo ? t("account.demo") : t("account.connected") }}</span>
      </span>
    </button>
    <AccountMenu v-if="menuOpen" @after-leave="menuOpen = false" />
  </aside>
</template>
