import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Appointment, Offer } from "@/types";
import i18n from "~/i18n";
import { appointmentPin, offerPin } from "~/lib/mapPin";

const t = (key: string, params?: Record<string, unknown>) => i18n.global.t(key, params ?? {});

const residence = {
  addressLine1: "Mariendalsvej 52A, 1. MF",
  addressLine2: "2000 Frederiksberg",
  location: { latitude: 55.69, longitude: 12.53 },
};

function appointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: "appt",
    title: "Lejlighed på Mariendalsvej",
    date: "2026-10-18",
    start: "15:00",
    end: "16:00",
    cancelled: false,
    residence,
    financials: { monthlyRentIncludingAconto: 8500 },
    ...overrides,
  } as Appointment;
}

describe("appointmentPin", () => {
  test("places the pin at the residence, with address, full date and time, and rent", () => {
    expect(appointmentPin(appointment(), t)).toEqual({
      id: "appt",
      lat: 55.69,
      lng: 12.53,
      label: "Mariendalsvej 52A, 1. MF",
      sublabel: "2000 Frederiksberg",
      details: ["d. 18/10, 15:00 - 16:00", "8.500\u00a0kr. / md"],
    });
  });

  test("is waiting for a date when it has none", () => {
    expect(appointmentPin(appointment({ date: null, start: null, end: null }), t)?.details).toEqual([
      "Afventer dato",
      "8.500\u00a0kr. / md",
    ]);
  });

  test("keeps a cancelled appointment's pin, saying it is cancelled", () => {
    expect(appointmentPin(appointment({ cancelled: true }), t)?.details).toEqual([
      "Aflyst",
      "d. 18/10, 15:00 - 16:00",
      "8.500\u00a0kr. / md",
    ]);
  });
});

function offer(overrides: Partial<Offer> = {}): Offer {
  return {
    id: "offer",
    residence: { ...residence, addressLine1: "Philip Schous Vej 21, 3. TH." },
    deadline: "2026-10-23T00:00:00Z",
    availableFrom: "2026-12-01T00:00:00Z",
    rooms: 3,
    area: 78,
    financials: { monthlyRentIncludingAconto: 8500 },
    ...overrides,
  } as Offer;
}

describe("offerPin", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-18T10:00:00"));
  });
  afterEach(() => vi.useRealTimers());

  test("places the pin at the residence, with address, rooms and size, deadline, move-in and rent", () => {
    expect(offerPin(offer(), t)).toEqual({
      id: "offer",
      lat: 55.69,
      lng: 12.53,
      label: "Philip Schous Vej 21, 3. TH.",
      sublabel: "2000 Frederiksberg",
      details: ["3 værelser · 78 m²", "Svarfrist: 5 dage", "Ledig fra: 1. december 2026", "8.500\u00a0kr. / md"],
    });
  });

  test("leaves out a line with no value", () => {
    const bare = offer({ rooms: null, area: null, deadline: null, availableFrom: null });
    expect(offerPin(bare, t)?.details).toEqual(["8.500\u00a0kr. / md"]);
  });

  test.each([
    [{ area: null }, "3 værelser"],
    [{ rooms: null }, "78 m²"],
  ])("shows rooms or size alone when only one is known", (overrides, expected) => {
    expect(offerPin(offer(overrides), t)?.details[0]).toBe(expected);
  });
});

test("a residence with no location gets no pin", () => {
  const nowhere = { ...residence, location: null };
  expect(appointmentPin(appointment({ residence: nowhere }), t)).toBeNull();
  expect(offerPin(offer({ residence: nowhere }), t)).toBeNull();
});
