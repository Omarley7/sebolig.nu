import { getDeadlineUrgency } from "./deadlineUrgency";
import { formatShortDate } from "./formatters";
import type { ClosedReason, TabbedOffer } from "./offerTabs";

type Translate = (key: string, params?: Record<string, unknown>) => string;

/** The chip's colours: deadline urgency, a neutral status, or the navy "you said yes" tint. */
export type ChipTone = "urgent" | "soon" | "calm" | "yes";

export const chipClasses: Record<ChipTone, string> = {
  urgent: "bg-urgent text-urgent-ink",
  soon: "bg-soon text-soon-ink",
  calm: "bg-chip text-chip-ink",
  yes: "bg-yes text-yes-ink",
};

const CLOSED_KEYS: Record<ClosedReason, string> = {
  declined: "offers.status.declined",
  expired: "offers.status.expired",
  rentedToOthers: "offers.status.rented",
  won: "offers.status.won",
  withdrawn: "offers.status.withdrawn",
  ended: "offers.status.ended",
};

/** An offer's chip at the top right of its row, and the line under it (Q15). */
export function offerChip({ offer, closed, closedAt }: TabbedOffer, t: Translate, locale: string): { label: string; tone: ChipTone; sub: string | null } {
  const deadline = offer.deadline ? formatShortDate(offer.deadline, locale) : null;
  if (closed) return { label: t(CLOSED_KEYS[closed]), tone: "calm", sub: closedAt ? formatShortDate(closedAt, locale) : deadline };
  if (offer.recipientState === "OfferAccepted") return { label: t("offers.status.saidYes"), tone: "yes", sub: t("offers.awaitingLandlord") };
  const urgency = getDeadlineUrgency(offer.deadline, t);
  if (urgency.color === "red") return { label: t("offers.answerBy", { when: urgency.relative }), tone: "urgent", sub: deadline };
  return { label: urgency.relative, tone: urgency.color === "amber" ? "soon" : "calm", sub: deadline };
}
