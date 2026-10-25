export type UrgencyColor = "red" | "amber" | "green" | "neutral";

export type DeadlineUrgency = {
  color: UrgencyColor;
  relative: string;
};

/**
 * Returns urgency level and relative time string for an offer deadline.
 * Uses i18n keys via the provided t function.
 */
export function getDeadlineUrgency(
  deadline: string | null,
  t: (key: string, params?: Record<string, unknown>) => string,
): DeadlineUrgency {
  if (!deadline) {
    return { color: "neutral", relative: t("offers.noDeadline") };
  }

  // Calendar days between the two local dates. Counted as UTC days, because across a clock
  // change two local midnights are 23 or 25 hours apart.
  const dayNumber = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / (1000 * 60 * 60 * 24);
  const diffDays = dayNumber(new Date(deadline)) - dayNumber(new Date());

  if (diffDays <= 0) {
    return { color: "red", relative: t("offers.today") };
  }
  if (diffDays === 1) {
    return { color: "red", relative: t("offers.tomorrow") };
  }
  if (diffDays <= 5) {
    return { color: "amber", relative: t("offers.daysRemaining", { count: diffDays }) };
  }
  return { color: "green", relative: t("offers.daysRemaining", { count: diffDays }) };
}

/** Tailwind color classes for urgency indicators */
export const urgencyColors: Record<UrgencyColor, { dot: string; text: string }> = {
  red: { dot: "bg-red-500", text: "text-red-500" },
  amber: { dot: "bg-amber-500", text: "text-amber-500" },
  green: { dot: "bg-emerald-500", text: "text-emerald-500" },
  neutral: { dot: "bg-neutral-400", text: "text-neutral-400" },
};
