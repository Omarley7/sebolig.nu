import { expect, it } from "vitest";
import type { WritableComputedRef } from "vue";
import i18n from "~/i18n";
import { changeText } from "./changeText";
import type { ChangeDetail, ChangeKind } from "./changes";

const CARD = { addressLine1: "Vej 1", addressLine2: null, imageUrl: "img" };
const t = (key: string, params?: Record<string, unknown>) => i18n.global.t(key, params ?? {});
// In English, as the app shows it after switching language.
(i18n.global.locale as unknown as WritableComputedRef<string>).value = "en";

function text(detail: ChangeDetail, kind: ChangeKind = "appointment") {
  return changeText({ kind, itemId: "1", offerId: "1", card: CARD, detail }, t);
}

it("a removal is worded by why it left: won, rented to someone else, withdrawn, moved, or unknown", () => {
  const removed = (state: string | null, kind?: ChangeKind) => text({ field: "removed", state }, kind).text;

  expect([
    removed("AwardedToYou"),
    removed("Awarded"),
    removed("AwardedExternally", "offer"),
    removed("Released"),
    removed("Finished", "offer"),
    removed("RetiredFromAwarded"),
    removed(null, "offer"),
  ]).toEqual([
    "You got it! 🎉",
    "Rented to someone else",
    "Rented to someone else",
    "Withdrawn by the landlord",
    "Moved to appointments",
    "No longer in your appointments",
    "No longer in your offers",
  ]);
});

it("a new message names its sender and quotes its opening words", () => {
  const latest = { from: "landlord" as const, senderName: "Udlejningen", excerpt: "Husk lønsedler", hasAttachments: false };

  expect(text({ field: "message", count: 2, latest })).toEqual({ text: "2 new messages, latest from Udlejningen", quote: "Husk lønsedler" });
});

it("a viewing getting a date says when, and a moved one says from when to when", () => {
  const none = { date: null, start: null, end: null };
  const at = (start: string) => ({ date: "2026-11-12", start, end: null });

  expect(text({ field: "viewing", from: none, to: at("17:00") }).text).toBe("Viewing date set: d. 12/11, 17:00");
  expect(text({ field: "viewing", from: at("16:00"), to: at("17:00") }).text).toBe("Viewing moved: d. 12/11, 16:00 → d. 12/11, 17:00");
});
