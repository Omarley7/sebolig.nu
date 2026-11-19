import { computed, ref, watch } from "vue";
import { isDarkTheme, readThemePreference, type ThemePreference } from "~/lib/theme";

const STORAGE_KEY = "theme-preference";

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

const preference = ref<ThemePreference>(readThemePreference(readStored()));
const media = window.matchMedia("(prefers-color-scheme: dark)");
const deviceDark = ref(media.matches);
media.addEventListener?.("change", (e) => (deviceDark.value = e.matches));

const isDark = computed(() => isDarkTheme(preference.value, deviceDark.value));

function apply(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#151B28" : "#FFFFFF");
}

apply(isDark.value);
watch(isDark, apply);
watch(preference, (value) => {
  try {
    if (value === "auto") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Private mode: the choice lasts for this visit only.
  }
});

/** The theme: Lys, Mørk or Automatisk (the default), and whether the page is dark now. */
export function useDarkMode() {
  return { preference, isDark };
}
