<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import AccountMenu from "~/components/account/AccountMenu.vue";
import UserAvatar from "~/components/account/UserAvatar.vue";
import ChangesBell from "~/components/changes/ChangesBell.vue";
import { useAuth } from "~/composables/useAuth";
import { useLocale } from "~/composables/useLocale";
import AppLogo from "./AppLogo.vue";

/**
 * The header below lg (Q4): logo and wordmark, then the bell and the avatar that opens the account
 * menu. Without a Connection: the logo and a language switch.
 */
const { t } = useI18n();
const auth = useAuth();
const { locale, toggle } = useLocale();
const menuOpen = ref(false);
</script>

<template>
  <header class="sticky top-0 z-30 h-14 shrink-0 flex items-center justify-between pl-5 pr-2 bg-surface border-b border-border">
    <router-link to="/" class="rounded-lg"><AppLogo /></router-link>
    <div v-if="auth.isAuthenticated" class="flex items-center">
      <ChangesBell />
      <button type="button" class="icon-btn rounded-full" :aria-label="t('account.open')" @click="menuOpen = true">
        <UserAvatar />
      </button>
      <AccountMenu v-if="menuOpen" @after-leave="menuOpen = false" />
    </div>
    <button
      v-else
      type="button"
      class="btn !px-2.5 text-muted uppercase"
      :aria-label="locale === 'da' ? 'Switch to English' : 'Skift til dansk'"
      @click="toggle"
    >
      {{ locale }}
    </button>
  </header>
</template>
