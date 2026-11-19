type Translate = (key: string, params?: Record<string, unknown>) => string;

/** How long ago something was, for "Opdateret …": "lige nu", "for 5 min. siden", "for 3 timer siden", "for 2 dage siden". */
export function updatedAgo(at: Date, now: Date, t: Translate): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - at.getTime()) / 60_000));
  if (minutes < 1) return t("common.updatedJustNow");
  if (minutes < 60) return t("common.updatedMinutesAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("common.updatedHoursAgo", { count: hours });
  return t("common.updatedDaysAgo", { count: Math.floor(hours / 24) });
}
