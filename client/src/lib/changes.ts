import type { Appointment, Financials, MessageSender, Offer, RecipientState, RemovedState, Residence } from "@/types";
import type { CursorData } from "~/localData/delta";

/**
 * What changed on the user's appointments and offers, as found by comparing what was shown before
 * an Automatic check or a Refresh with what is shown after it. Waiting lists are not compared.
 */

/** Which list a change is about. */
export type ChangeKind = "appointment" | "offer";

/** What a change keeps of its card, so it still reads once the card has left its list. */
export type CardCopy = Pick<Residence, "addressLine1" | "addressLine2"> & { imageUrl: string };

/** An appointment's viewing time. */
export type Viewing = Pick<Appointment, "date" | "start" | "end">;

export type Money = { rent: number; deposit: number };

/** The latest of the new messages: who sent it and its opening words. */
export type MessageGist = { from: MessageSender; senderName: string | null; excerpt: string; hasAttachments: boolean };

/** What changed on one card, by field: the value before and the value now. */
export type ChangeDetail =
  | { field: "added" }
  | { field: "viewing"; from: Viewing; to: Viewing }
  | { field: "cancelled"; from: boolean; to: boolean }
  | { field: "message"; latest: MessageGist; count: number }
  | { field: "position"; from: number | null; to: number | null }
  | { field: "financials"; from: Money; to: Money }
  | { field: "answer"; from: RecipientState | null; to: RecipientState }
  | { field: "deadline"; from: string | null; to: string | null }
  | { field: "moveIn"; from: string | null; to: string | null }
  /** Left the list; `state` says why (see `RemovedState`), null when unknown, as after a Refresh. */
  | { field: "removed"; state: RemovedState | null };

export type ChangeField = ChangeDetail["field"];

/** One change found on one card. */
export type FoundChange = {
  kind: ChangeKind;
  /** The id its list opens the card's detail sheet by. */
  itemId: string;
  /** The findbolig.nu offer behind the card, for appointments and offers alike. */
  offerId: string;
  card: CardCopy;
  detail: ChangeDetail;
};

/** How long a message excerpt is kept; the panel cuts it shorter. */
const EXCERPT_LENGTH = 140;

/** Whether two plain values (JSON, as Local data holds them) are the same. */
export const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const money = ({ monthlyRentIncludingAconto, deposit }: Financials): Money => ({ rent: monthlyRentIncludingAconto, deposit });

/** A value that changed, as a change of `field`; nothing when it didn't. */
function fieldChange<F extends ChangeField, V>(field: F, from: V, to: V) {
  return same(from, to) ? [] : [{ field, from, to } as unknown as Extract<ChangeDetail, { field: F }>];
}

/** An answer given on findbolig.nu itself: accepted or declined, from whatever it was. */
function answered(from: RecipientState | null, to: RecipientState | null): ChangeDetail[] {
  return to && to !== "OfferReceived" && to !== from ? [{ field: "answer", from, to }] : [];
}

function copyCard({ residence, imageUrl }: Pick<Appointment, "residence" | "imageUrl">): CardCopy {
  return { addressLine1: residence.addressLine1, addressLine2: residence.addressLine2, imageUrl };
}

/**
 * Compares two versions of a list by `keyOf`: what changed on each card still there, new cards,
 * and cards that left. A full fetch that withheld its cursor left out the items it failed to
 * fetch, so their absence is not taken as leaving, nor their coming back after it as new.
 */
function compare<T>(
  before: CursorData<T>,
  after: CursorData<T>,
  { kind, keyOf, idOf, cardOf, fieldChanges }: {
    kind: ChangeKind;
    keyOf(item: T): string;
    idOf(item: T): string;
    cardOf(item: T): CardCopy;
    fieldChanges(before: T, after: T): ChangeDetail[];
  },
): FoundChange[] {
  const found = (item: T, detail: ChangeDetail): FoundChange => ({ kind, itemId: idOf(item), offerId: keyOf(item), card: cardOf(item), detail });
  const beforeByKey = new Map(before.items.map((item) => [keyOf(item), item]));
  const afterKeys = new Set(after.items.map(keyOf));

  const changes = after.items.flatMap((item) => {
    const old = beforeByKey.get(keyOf(item));
    if (old) return fieldChanges(old, item).map((detail) => found(item, detail));
    return before.cursor === null ? [] : [found(item, { field: "added" })];
  });
  if (after.cursor === null) return changes;
  const removedStates = after.removedStates ?? {};
  for (const item of before.items) {
    if (!afterKeys.has(keyOf(item))) changes.push(found(item, { field: "removed", state: removedStates[keyOf(item)] ?? null }));
  }
  return changes;
}

/** New messages from others in an appointment's thread, as one change naming the latest. */
function newMessages(before: Appointment, after: Appointment): ChangeDetail[] {
  // Stored before threads were kept: its thread arriving now is not news.
  if (!before.messages || !after.messages) return [];
  const newestBefore = Math.max(...before.messages.map((m) => new Date(m.sentAt).getTime()));
  const arrived = after.messages.filter((m) => m.from !== "you" && new Date(m.sentAt).getTime() > newestBefore);
  const latest = arrived.at(-1);
  if (!latest) return [];
  const excerpt = latest.body.replace(/\s+/g, " ").trim().slice(0, EXCERPT_LENGTH);
  return [
    {
      field: "message",
      count: arrived.length,
      latest: { from: latest.from, senderName: latest.senderName, excerpt, hasAttachments: latest.hasAttachments },
    },
  ];
}

const viewing = ({ date, start, end }: Appointment): Viewing => ({ date, start, end });

/** The answer an appointment carries: its recipient state, or what its accepted/declined stamps say. */
function answerOf({ recipientState, accepted, declined }: Appointment): RecipientState | null {
  if (recipientState) return recipientState as RecipientState;
  return accepted ? "OfferAccepted" : declined ? "OfferDeclined" : null;
}

/** What changed on the user's appointments between two versions of them. */
export function appointmentChanges(before: CursorData<Appointment>, after: CursorData<Appointment>): FoundChange[] {
  return compare<Appointment>(before, after, {
    kind: "appointment",
    keyOf: (appointment) => appointment.offerId,
    idOf: (appointment) => appointment.id,
    cardOf: copyCard,
    fieldChanges: (old, now) => [
      // A viewing losing its date is the extractor reading less, not news.
      ...(now.date ? fieldChange("viewing", viewing(old), viewing(now)) : []),
      ...fieldChange("cancelled", old.cancelled, now.cancelled),
      ...newMessages(old, now),
      ...fieldChange("position", old.position, now.position),
      ...fieldChange("financials", money(old.financials), money(now.financials)),
      ...answered(answerOf(old), answerOf(now)),
    ],
  });
}

/** What changed on the user's offers between two versions of them. */
export function offerChanges(before: CursorData<Offer>, after: CursorData<Offer>): FoundChange[] {
  return compare<Offer>(before, after, {
    kind: "offer",
    keyOf: (offer) => offer.id,
    idOf: (offer) => offer.id,
    cardOf: copyCard,
    fieldChanges: (old, now) => [
      ...fieldChange("deadline", old.deadline, now.deadline),
      ...fieldChange("moveIn", old.availableFrom, now.availableFrom),
      ...fieldChange("position", old.position, now.position),
      ...fieldChange("financials", money(old.financials), money(now.financials)),
      ...answered(old.recipientState, now.recipientState),
    ],
  });
}
