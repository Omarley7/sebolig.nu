import type { Offer, RemovedState } from "@/types";
import { movedToAppointments } from "./changes";

/** The three tabs on Tilbud (Q7): Skal besvares, Accepteret and Afsluttet. */
export type OfferTab = "open" | "accepted" | "closed";

export const OFFER_TABS: readonly OfferTab[] = ["open", "accepted", "closed"];

/**
 * Why an offer is in Afsluttet, which its chip says: the user declined it, its deadline passed
 * unanswered, or it left the offers list (rented to someone else, won, withdrawn, or ended for a
 * reason not understood yet).
 */
export type ClosedReason = "declined" | "expired" | "rentedToOthers" | "won" | "withdrawn" | "ended";

/** An offer that left the offers list, as the finished-offers list keeps it: the offer as it was, why it left and when. */
export type FinishedOffer = { offer: Offer; state: RemovedState | null; at: string };

export type TabbedOffer = {
  offer: Offer;
  closed?: ClosedReason;
  /** When it closed, for an offer that left the list. */
  closedAt?: string;
};

const dayNumber = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;

/** Whether the offer's deadline was on a day before today. An offer due today can still be answered. */
export function isExpired(offer: Pick<Offer, "deadline">, now: Date): boolean {
  return offer.deadline !== null && dayNumber(new Date(offer.deadline)) < dayNumber(now);
}

const time = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : null);

const byDeadline = (a: TabbedOffer, b: TabbedOffer) => {
  const [x, y] = [time(a.offer.deadline), time(b.offer.deadline)];
  if (x === null) return y === null ? 0 : 1;
  if (y === null) return -1;
  return x - y;
};

/** Newest first: when it left the list, or else its deadline. */
const byClosing = (a: TabbedOffer, b: TabbedOffer) =>
  (time(b.closedAt ?? b.offer.deadline) ?? 0) - (time(a.closedAt ?? a.offer.deadline) ?? 0);

function reasonFor(state: RemovedState | null): ClosedReason {
  if (state === "AwardedToYou") return "won";
  if (state === "Awarded" || state === "AwardedExternally") return "rentedToOthers";
  if (state === "Released") return "withdrawn";
  return "ended";
}

/**
 * Sorts the user's offers into the tabs on Tilbud. Skal besvares: unanswered and still open
 * (a landlord-edited offer included), soonest deadline first. Accepteret: accepted, also past the
 * deadline, since the landlord decides after it. Afsluttet: declined, expired unanswered, and the
 * offers that left the list (`finished`), except those that went on to appointments or are back.
 */
export function offerTabs(offers: Offer[], finished: FinishedOffer[], now: Date): Record<OfferTab, TabbedOffer[]> {
  const tabs: Record<OfferTab, TabbedOffer[]> = { open: [], accepted: [], closed: [] };
  for (const offer of offers) {
    if (offer.recipientState === "OfferAccepted") tabs.accepted.push({ offer });
    else if (offer.recipientState === "OfferDeclined") tabs.closed.push({ offer, closed: "declined" });
    else if (isExpired(offer, now)) tabs.closed.push({ offer, closed: "expired" });
    else tabs.open.push({ offer });
  }
  const listed = new Set(offers.map((o) => o.id));
  for (const { offer, state, at } of finished) {
    if (listed.has(offer.id) || movedToAppointments("offer", state, offer)) continue;
    tabs.closed.push({ offer, closed: reasonFor(state), closedAt: at });
  }
  tabs.open.sort(byDeadline);
  tabs.accepted.sort(byDeadline);
  tabs.closed.sort(byClosing);
  return tabs;
}

/** The Tilbud badge (Q32): open offers whose deadline hasn't passed. */
export function unansweredOfferCount(offers: Offer[], now: Date): number {
  return offers.filter((o) => o.recipientState === "OfferReceived" && !isExpired(o, now)).length;
}
