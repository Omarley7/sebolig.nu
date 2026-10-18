import { describe, expect, test } from "vitest";
import type { MessageSender, ThreadMessage } from "@/types";
import { followUp, withLinks } from "~/lib/thread";

function message(from: MessageSender, sentAt: string, body: string = from): ThreadMessage {
  return { from, senderName: null, sentAt, body, hasAttachments: false };
}

const notice = message("findbolig", "2026-10-01T09:00:00Z");
const invitation = message("landlord", "2026-10-02T09:00:00Z");

describe("followUp", () => {
  test("is the latest message once something came after the landlord's first", () => {
    const howToApply = message("landlord", "2026-10-06T09:00:00Z", "Sådan søger du");
    expect(followUp([notice, invitation, message("you", "2026-10-03T09:00:00Z"), howToApply])).toBe(howToApply);
  });

  test("counts a findbolig.nu notice after the invitation", () => {
    const closing = message("findbolig", "2026-10-09T09:00:00Z", "Boligen er desværre udlejet");
    expect(followUp([notice, invitation, closing])).toBe(closing);
  });

  test.each([
    ["only the invitation", [notice, invitation]],
    ["no landlord message at all", [notice, message("you", "2026-10-03T09:00:00Z")]],
    ["no messages", []],
  ])("is nothing with %s", (_, messages) => {
    expect(followUp(messages)).toBeNull();
  });
});

describe("withLinks", () => {
  test("splits out web addresses as links, leaving trailing punctuation as text", () => {
    expect(withLinks("Søg på https://example.dk/ansog?id=7. Eller www.example.dk, tak")).toEqual([
      { text: "Søg på " },
      { text: "https://example.dk/ansog?id=7", href: "https://example.dk/ansog?id=7" },
      { text: ". Eller " },
      { text: "www.example.dk", href: "https://www.example.dk" },
      { text: ", tak" },
    ]);
  });

  test("keeps line breaks and leaves anything that isn't a web address as text", () => {
    expect(withLinks("Hej\njavascript:alert(1) <b>x</b>")).toEqual([{ text: "Hej\njavascript:alert(1) <b>x</b>" }]);
  });
});
