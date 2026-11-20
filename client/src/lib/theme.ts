/** The theme setting in the account menu: Lys, Mørk or Automatisk (follow the device). */
export type ThemePreference = "light" | "dark" | "auto";

/** The preference as stored; earlier versions stored only "light" or "dark". Nothing stored means Automatisk. */
export function readThemePreference(stored: string | null): ThemePreference {
  return stored === "light" || stored === "dark" ? stored : "auto";
}

/** Whether the page shows dark, given the preference and whether the device prefers dark. */
export function isDarkTheme(preference: ThemePreference, deviceDark: boolean): boolean {
  return preference === "auto" ? deviceDark : preference === "dark";
}
