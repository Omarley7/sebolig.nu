<script setup lang="ts">
import { Eye, EyeOff, Lock } from "lucide-vue-next";
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { useAuth } from "~/composables/useAuth";
import { REPO_URL } from "~/config";

/**
 * The one place a user connects their findbolig.nu account. Used on the landing page and in the
 * connect dialog, so both carry the same wording, autofill hints and trust cues.
 */
const emit = defineEmits<{ connected: [] }>();

const auth = useAuth();
const { t } = useI18n();
const password = ref("");
const showPassword = ref(false);

async function handleConnect() {
  if (await auth.connect(auth.email, password.value)) {
    password.value = "";
    emit("connected");
  }
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <!-- The heading is where an ended Connection gets explained: a sentence that stays, not a toast -->
    <p
      class="text-sm font-semibold leading-snug"
      :class="auth.endedByPasswordChange ? 'rounded-xl bg-urgent text-urgent-ink px-3 py-2.5' : 'text-ink'"
    >
      {{ auth.endedByPasswordChange ? t("auth.passwordChangedHeading") : t("auth.connectHeading") }}
    </p>

    <form class="flex flex-col gap-3" @submit.prevent="handleConnect">
      <label class="flex flex-col gap-1.5">
        <span class="text-[13px] font-semibold text-muted">{{ t("auth.emailPlaceholder") }}</span>
        <input
          v-model="auth.email"
          type="email"
          name="username"
          autocomplete="username"
          inputmode="email"
          :disabled="auth.isLoading"
          class="h-[46px] px-3 rounded-[10px] border border-border-strong bg-surface text-ink text-base disabled:opacity-50"
        />
      </label>
      <label class="flex flex-col gap-1.5">
        <span class="text-[13px] font-semibold text-muted">{{ t("auth.passwordPlaceholder") }}</span>
        <span class="relative">
          <input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            name="password"
            autocomplete="current-password"
            :disabled="auth.isLoading"
            class="w-full h-[46px] pl-3 pr-12 rounded-[10px] border border-border-strong bg-surface text-ink text-base disabled:opacity-50"
          />
          <button
            type="button"
            class="icon-btn absolute right-0.5 top-1/2 -translate-y-1/2 !size-10 text-muted"
            :aria-label="showPassword ? t('auth.hidePassword') : t('auth.showPassword')"
            @click="showPassword = !showPassword"
          >
            <EyeOff v-if="showPassword" class="size-5" aria-hidden="true" />
            <Eye v-else class="size-5" aria-hidden="true" />
          </button>
        </span>
      </label>

      <button type="submit" class="btn btn-primary !min-h-12 !text-[15px] !font-bold" :disabled="auth.isLoading || !auth.email || !password">
        {{ auth.isLoading ? t("auth.connecting") : t("auth.connectButton") }}
      </button>
    </form>

    <!-- Custody note: the true thing, always visible -->
    <p data-testid="custody-note" class="flex gap-2 text-[13px] leading-snug text-muted">
      <Lock class="size-4 shrink-0 mt-px" aria-hidden="true" />
      <span>
        {{ t("auth.custodyNote") }}
        <router-link :to="{ name: 'explainer' }" class="font-semibold text-accent hover:underline">{{ t("explainer.linkLabel") }} →</router-link>
      </span>
    </p>
    <p data-testid="non-affiliation" class="text-xs text-muted">
      {{ t("footer.notAffiliated") }}
      <a :href="REPO_URL" target="_blank" rel="noopener noreferrer" class="underline hover:text-ink">{{ t("common.sourceCode") }}</a>.
    </p>
  </div>
</template>
