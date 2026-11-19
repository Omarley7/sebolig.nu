import type { Offer } from "@/types";
import { describe, expect, it } from "vitest";
import { offerTabs, unansweredOfferCount } from "./offerTabs";

const NOW = new Date("2026-11-19T10:00:00+01:00");

function offer(id: string, fields: Partial<Offer> = {}): Offer {
  return {
    id,
    residence: { addressLine1: `${id} 1`, addressLine2: "2000 Frederiksberg", location: null },
    deadline: "2026-11-25T00:00:00Z",
    availableFrom: null,
    rooms: 2,
    area: 60,
    recipientState: "OfferReceived",
    company: "",
    financials: { monthlyRentIncludingAconto: 9000, monthlyRentExcludingAconto: 8500, utilityCosts: 500, deposit: 27000, prepaidRent: 0, firstPayment: 36000 },
    imageUrl: "",
    images: [],
    blueprints: [],
    position: 4,
    ...fields,
  };
}

const ids = (rows: { offer: Offer }[]) => rows.map((r) => r.offer.id);

describe("Skal besvares", () => {
  it("holds the unanswered offers, soonest deadline first, those without one last", () => {
    const tabs = offerTabs(
      [
        offer("later", { deadline: "2026-11-27T00:00:00Z" }),
        offer("none", { deadline: null }),
        offer("soon", { deadline: "2026-11-20T00:00:00Z" }),
      ],
      [],
      NOW,
    );

    expect(ids(tabs.open)).toEqual(["soon", "later", "none"]);
  });

  it("keeps an offer due today, and one the landlord edited", () => {
    const tabs = offerTabs(
      [offer("today", { deadline: "2026-11-19T00:00:00Z" }), offer("edited", { editedByLandlord: true })],
      [],
      NOW,
    );

    expect(ids(tabs.open)).toEqual(["today", "edited"]);
  });

  it("lets an unanswered offer whose deadline has passed go to Afsluttet as Udløbet", () => {
    const tabs = offerTabs([offer("late", { deadline: "2026-11-18T00:00:00Z" })], [], NOW);

    expect(ids(tabs.open)).toEqual([]);
    expect(tabs.closed.map((r) => [r.offer.id, r.closed])).toEqual([["late", "expired"]]);
  });
});

describe("Accepteret", () => {
  it("holds accepted offers, also once the deadline has passed: the landlord decides after it", () => {
    const tabs = offerTabs(
      [offer("yes", { recipientState: "OfferAccepted", deadline: "2026-11-10T00:00:00Z" }), offer("open")],
      [],
      NOW,
    );

    expect(ids(tabs.accepted)).toEqual(["yes"]);
  });
});

describe("Afsluttet", () => {
  it("holds declined offers as Afvist", () => {
    const tabs = offerTabs([offer("no", { recipientState: "OfferDeclined" })], [], NOW);

    expect(tabs.closed.map((r) => [r.offer.id, r.closed])).toEqual([["no", "declined"]]);
  });

  it("holds offers that left the list, by why they left, newest first", () => {
    const tabs = offerTabs(
      [],
      [
        { offer: offer("rented"), state: "AwardedExternally", at: "2026-11-12T09:00:00Z" },
        { offer: offer("won"), state: "AwardedToYou", at: "2026-11-15T09:00:00Z" },
        { offer: offer("pulled"), state: "Released", at: "2026-11-14T09:00:00Z" },
        { offer: offer("gone"), state: null, at: "2026-11-13T09:00:00Z" },
      ],
      NOW,
    );

    expect(tabs.closed.map((r) => [r.offer.id, r.closed])).toEqual([
      ["won", "won"],
      ["pulled", "withdrawn"],
      ["gone", "ended"],
      ["rented", "rentedToOthers"],
    ]);
  });

  it("leaves out an offer that left for appointments, and one that is back in the list", () => {
    const tabs = offerTabs(
      [offer("back")],
      [
        { offer: offer("viewing", { recipientState: "OfferAccepted" }), state: "Finished", at: "2026-11-15T09:00:00Z" },
        { offer: offer("back"), state: "Awarded", at: "2026-11-15T09:00:00Z" },
      ],
      NOW,
    );

    expect(ids(tabs.closed)).toEqual([]);
    expect(ids(tabs.open)).toEqual(["back"]);
  });
});

describe("the Tilbud badge", () => {
  it("counts the open offers whose deadline hasn't passed", () => {
    const offers = [
      offer("a"),
      offer("b", { deadline: null }),
      offer("late", { deadline: "2026-11-01T00:00:00Z" }),
      offer("yes", { recipientState: "OfferAccepted" }),
      offer("no", { recipientState: "OfferDeclined" }),
    ];

    expect(unansweredOfferCount(offers, NOW)).toBe(2);
  });
});
