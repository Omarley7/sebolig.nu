import type { Appointment, Offer, RemovedState } from "@/types";
import { movedToAppointments, type ChangeKind, type FoundChange, type Money } from "./changes";
import { formatCurrency, formatDate, formatTimeSlot } from "./formatters";
import { senderLabel } from "./thread";

type Translate = (key: string, params?: Record<string, unknown>) => string;

/** How a change reads in the panel: one line, and the opening words of a message to quote under it. */
export type ChangeText = { text: string; quote: string | null };

const orDash = (value: string | null) => value ?? "–";
const day = (date: string | null) => (date ? formatDate(date) : null);
const place = (position: number | null) => (position == null ? null : `#${position}`);

/**
 * Why a card left its list, in words. The meanings come from findbolig.nu's closing notices: an
 * awarded offer was rented to someone ranked higher (unless the user won it), a released one was
 * mostly withdrawn by the landlord. An offer the user accepted, can no longer answer but still has a
 * viewing of moved to appointments. Anything else (RetiredFromAwarded, say) is not understood yet.
 */
function removalKey(kind: ChangeKind, state: RemovedState | null, last?: Appointment | Offer): string {
  if (state === "AwardedToYou") return "changes.removed.won";
  if (state === "Awarded" || state === "AwardedExternally") return "changes.removed.rentedToOthers";
  if (state === "Released") return "changes.removed.withdrawn";
  if (movedToAppointments(kind, state, last)) return "changes.removed.movedToAppointments";
  return `changes.removed.${kind}`;
}

function moneyText(from: Money, to: Money, t: Translate): string {
  const parts = [];
  if (from.rent !== to.rent) parts.push(t("changes.rent", { from: formatCurrency(from.rent), to: formatCurrency(to.rent) }));
  if (from.deposit !== to.deposit) parts.push(t("changes.deposit", { from: formatCurrency(from.deposit), to: formatCurrency(to.deposit) }));
  return parts.join(" · ");
}

/** Why a card left its list, in the user's language; `last` is the card as it was when it left. */
export function removalText(kind: ChangeKind, state: RemovedState | null, last: Appointment | Offer | undefined, t: Translate): string {
  return t(removalKey(kind, state, last));
}

/** What a change says, in the user's language. */
export function changeText({ kind, detail }: FoundChange, t: Translate): ChangeText {
  const line = (text: string): ChangeText => ({ text, quote: null });
  switch (detail.field) {
    case "added":
      return line(t("changes.newOffer"));
    case "viewing": {
      const to = formatTimeSlot(detail.to, t, true);
      return line(
        detail.from.date === null
          ? t("changes.viewingSet", { when: to })
          : t("changes.viewingMoved", { from: formatTimeSlot(detail.from, t, true), to }),
      );
    }
    case "cancelled":
      return line(t(detail.to ? "changes.cancelled" : "changes.backOn"));
    case "message": {
      const sender = senderLabel(detail.latest, t);
      const text = detail.count > 1 ? t("changes.messages", { count: detail.count, sender }) : t("changes.message", { sender });
      return { text, quote: detail.latest.excerpt || (detail.latest.hasAttachments ? t("appointments.thread.attachment") : null) };
    }
    case "position":
      return line(t("changes.position", { from: orDash(place(detail.from)), to: orDash(place(detail.to)) }));
    case "financials":
      return line(moneyText(detail.from, detail.to, t));
    case "answer":
      return line(t(detail.to === "OfferAccepted" ? "changes.accepted" : "changes.declined"));
    case "deadline":
      return line(t("changes.deadline", { from: orDash(day(detail.from)), to: orDash(day(detail.to)) }));
    case "moveIn":
      return line(t("changes.moveIn", { from: orDash(day(detail.from)), to: orDash(day(detail.to)) }));
    case "removed":
      return line(removalText(kind, detail.state, detail.last, t));
  }
}
