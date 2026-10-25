import type { Appointment, Offer } from "@/types";
import { afterEach, describe, expect, it } from "vitest";
import type { WritableComputedRef } from "vue";
import i18n from "~/i18n";
import { floorPlanFileName, offerShareText, viewingShareText } from "~/lib/share";

// Same cast the app uses in useLocale.ts; vue-i18n types the global locale loosely.
const locale = i18n.global.locale as unknown as WritableComputedRef<"da" | "en">;
const t = i18n.global.t as (key: string, params?: Record<string, unknown>) => string;

function viewing(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: "DEAS-O-o1",
    offerId: "o1",
    title: "3 værelses Lejlighed på 83 m²",
    date: "2026-10-20",
    start: "16:00",
    end: "17:00",
    cancelled: false,
    residence: { addressLine1: "Ålekistevej 59", addressLine2: "2720 Vanløse", location: null },
    rooms: 3,
    area: 83,
    financials: {
      monthlyRentIncludingAconto: 12564,
      monthlyRentExcludingAconto: 11800,
      utilityCosts: 764,
      deposit: 35400,
      prepaidRent: 0,
      firstPayment: 47964,
    },
    imageUrl: "",
    images: [],
    blueprints: [],
    position: 12,
    recipientState: "OfferAccepted",
    accepted: null,
    declined: null,
    messages: [{ from: "landlord", senderName: "Udlejer A/S", sentAt: "2026-10-01T09:00:00Z", body: "Hej Test Person", hasAttachments: false }],
    ...overrides,
  };
}

function offer(overrides: Partial<Offer> = {}): Offer {
  return {
    id: "o1",
    residence: { addressLine1: "Philip Schous Vej 21, 3. TH.", addressLine2: "2000 Frederiksberg", location: null },
    deadline: "2026-10-28",
    availableFrom: "2027-04-01",
    rooms: 3,
    area: 83,
    recipientState: "OfferReceived",
    company: "Boligselskabet Test",
    financials: {
      monthlyRentIncludingAconto: 12564,
      monthlyRentExcludingAconto: 11800,
      utilityCosts: 764,
      deposit: 35400,
      prepaidRent: 0,
      firstPayment: 47964,
    },
    imageUrl: "",
    images: [],
    blueprints: [],
    position: 7,
    ...overrides,
  };
}

afterEach(() => {
  locale.value = "da";
});

describe("viewingShareText", () => {
  it("lays a viewing out in Danish, with every part", () => {
    expect(viewingShareText(viewing(), { mapLink: true }, t, "da")).toBe(
      [
        "Fremvisning: Ålekistevej 59, 2720 Vanløse",
        "Tirsdag 20. oktober 2026, 16:00–17:00",
        // Intl keeps the amount and "kr." together with a no-break space.
        "12.564\u00a0kr./md · 3 værelser · 83 m²",
        "Kort: https://www.google.com/maps/search/?api=1&query=%C3%85lekistevej%2059%2C%202720%20Vanl%C3%B8se",
      ].join("\n"),
    );
  });

  it("leaves out the map line unless it is chosen", () => {
    expect(viewingShareText(viewing(), { mapLink: false }, t, "da")).not.toContain("Kort:");
  });

  it("leaves out a missing part instead of leaving a gap", () => {
    const text = viewingShareText(
      viewing({
        end: null,
        rooms: null,
        area: null,
        residence: { addressLine1: "Ålekistevej 59", addressLine2: null, location: null },
      }),
      { mapLink: true },
      t,
      "da",
    );

    expect(text).toBe(
      [
        "Fremvisning: Ålekistevej 59",
        "Tirsdag 20. oktober 2026, 16:00",
        "12.564\u00a0kr./md",
        "Kort: https://www.google.com/maps/search/?api=1&query=%C3%85lekistevej%2059",
      ].join("\n"),
    );
  });

  it("treats rooms and size missing from appointments stored before they existed as unknown", () => {
    const { rooms: _rooms, area: _area, ...stored } = viewing({ start: null, end: null });

    expect(viewingShareText(stored as Appointment, { mapLink: false }, t, "da")).toBe(
      ["Fremvisning: Ålekistevej 59, 2720 Vanløse", "Tirsdag 20. oktober 2026", "12.564\u00a0kr./md"].join("\n"),
    );
  });

  it("is written in English when the app is", () => {
    locale.value = "en";

    expect(viewingShareText(viewing(), { mapLink: true }, t, "en")).toBe(
      [
        "Viewing: Ålekistevej 59, 2720 Vanløse",
        "Tuesday 20 October 2026, 16:00–17:00",
        "12.564\u00a0kr./mo · 3 rooms · 83 m²",
        "Map: https://www.google.com/maps/search/?api=1&query=%C3%85lekistevej%2059%2C%202720%20Vanl%C3%B8se",
      ].join("\n"),
    );
  });

  it("never shares the queue position, the findbolig.nu link or the landlord's messages", () => {
    const text = viewingShareText(viewing(), { mapLink: true }, t, "da");

    expect(text).not.toMatch(/#12|findbolig|Udlejer|Test Person/);
  });
});

describe("offerShareText", () => {
  it("lays an offer out in Danish, with every part", () => {
    expect(offerShareText(offer(), { mapLink: true }, t, "da")).toBe(
      [
        "Boligtilbud: Philip Schous Vej 21, 3. TH., 2000 Frederiksberg",
        "12.564\u00a0kr./md · 3 værelser · 83 m²",
        "Ledig fra: 1. april 2027",
        "Svarfrist: 28. oktober 2026",
        "Kort: https://www.google.com/maps/search/?api=1&query=Philip%20Schous%20Vej%2021%2C%203.%20TH.%2C%202000%20Frederiksberg",
      ].join("\n"),
    );
  });

  it("leaves out the map line unless it is chosen", () => {
    expect(offerShareText(offer(), { mapLink: false }, t, "da")).not.toContain("Kort:");
  });

  it("leaves out a missing line instead of leaving a gap", () => {
    const text = offerShareText(
      offer({ availableFrom: null, deadline: null, rooms: null, area: null }),
      { mapLink: false },
      t,
      "da",
    );

    expect(text).toBe(["Boligtilbud: Philip Schous Vej 21, 3. TH., 2000 Frederiksberg", "12.564\u00a0kr./md"].join("\n"));
  });

  it("gives a deadline stored as a UTC midnight the day it names", () => {
    expect(offerShareText(offer({ deadline: "2026-10-28T00:00:00Z" }), { mapLink: false }, t, "da")).toContain(
      "Svarfrist: 28. oktober 2026",
    );
  });

  it("is written in English when the app is", () => {
    locale.value = "en";

    expect(offerShareText(offer(), { mapLink: true }, t, "en")).toBe(
      [
        "Housing offer: Philip Schous Vej 21, 3. TH., 2000 Frederiksberg",
        "12.564\u00a0kr./mo · 3 rooms · 83 m²",
        "Available from: 1 April 2027",
        "Deadline: 28 October 2026",
        "Map: https://www.google.com/maps/search/?api=1&query=Philip%20Schous%20Vej%2021%2C%203.%20TH.%2C%202000%20Frederiksberg",
      ].join("\n"),
    );
  });

  it("never shares the queue position, the company or the findbolig.nu link", () => {
    const text = offerShareText(offer(), { mapLink: true }, t, "da");

    expect(text).not.toMatch(/#7|Boligselskabet|findbolig|o1/);
  });
});

describe("floorPlanFileName", () => {
  it("names the floor plan after the street, in plain letters", () => {
    expect(floorPlanFileName("Ålekistevej 59, 1. tv", t)).toBe("plantegning-alekistevej-59-1-tv.png");
    expect(floorPlanFileName("Søndre Fasanvej 7", t)).toBe("plantegning-sondre-fasanvej-7.png");
    expect(floorPlanFileName("Philip Schous Vej 21", t)).toBe("plantegning-philip-schous-vej-21.png");
  });

  it("falls back to the bare word without a street", () => {
    expect(floorPlanFileName(null, t)).toBe("plantegning.png");
  });
});

