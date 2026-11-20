import type { Appointment } from "@/types";
import { describe, expect, it } from "vitest";
import { agenda, nextViewing } from "./agenda";

// Thursday 19 November 2026, 14:00 local time
const NOW = new Date(2026, 10, 19, 14, 0);

function appointment(id: string, date: string | null, start: string | null = null, end: string | null = null, fields: Partial<Appointment> = {}): Appointment {
  return {
    id,
    offerId: id,
    title: id,
    date,
    start,
    end,
    cancelled: false,
    residence: { addressLine1: id, addressLine2: null, location: null },
    rooms: null,
    area: null,
    financials: { monthlyRentIncludingAconto: 0, monthlyRentExcludingAconto: 0, utilityCosts: 0, deposit: 0, prepaidRent: 0, firstPayment: 0 },
    imageUrl: "",
    images: [],
    blueprints: [],
    position: null,
    recipientState: "OfferAccepted",
    accepted: null,
    declined: null,
    ...fields,
  };
}

const ids = (items: Appointment[]) => items.map((a) => a.id);

describe("the agenda", () => {
  it("groups upcoming viewings by day, soonest day first, by start time within a day, those without a time last", () => {
    const { days } = agenda(
      [
        appointment("next-week", "2026-11-26", "15:30", "15:50"),
        appointment("today-no-time", "2026-11-19"),
        appointment("today-late", "2026-11-19", "17:00", "17:20"),
        appointment("today-early", "2026-11-19", "15:00", "15:20"),
      ],
      NOW,
    );

    expect(days.map((d) => [d.date, ids(d.items)])).toEqual([
      ["2026-11-19", ["today-early", "today-late", "today-no-time"]],
      ["2026-11-26", ["next-week"]],
    ]);
  });

  it("puts viewings without a date under Afventer dato", () => {
    const { days, awaitingDate } = agenda([appointment("undated", null), appointment("blank", "  ")], NOW);

    expect(days).toEqual([]);
    expect(ids(awaitingDate)).toEqual(["undated", "blank"]);
  });

  it("puts viewings from before today under Tidligere, the latest first; today's stay in today", () => {
    const { days, past } = agenda(
      [
        appointment("long-ago", "2026-11-02", "10:00"),
        appointment("yesterday", "2026-11-18", "16:00"),
        appointment("this-morning", "2026-11-19", "09:00", "09:20"),
      ],
      NOW,
    );

    expect(ids(past)).toEqual(["yesterday", "long-ago"]);
    expect(days.map((d) => ids(d.items))).toEqual([["this-morning"]]);
  });
});

describe("Næste fremvisning", () => {
  it("is the first viewing still to come: today's that is over and cancelled ones are skipped", () => {
    const next = nextViewing(
      [
        appointment("tomorrow", "2026-11-20", "10:00"),
        appointment("over", "2026-11-19", "09:00", "09:20"),
        appointment("cancelled", "2026-11-19", "15:00", "15:20", { cancelled: true }),
        appointment("later-today", "2026-11-19", "16:00", "16:20"),
      ],
      NOW,
    );

    expect(next?.id).toBe("later-today");
  });

  it("counts a viewing today without a time as still to come", () => {
    expect(nextViewing([appointment("sometime", "2026-11-19")], NOW)?.id).toBe("sometime");
  });

  it("is nothing when no viewing has a date ahead", () => {
    expect(nextViewing([appointment("undated", null), appointment("past", "2026-11-01", "10:00")], NOW)).toBeNull();
  });
});
