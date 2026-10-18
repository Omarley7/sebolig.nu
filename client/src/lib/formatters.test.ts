import { describe, expect, test } from "vitest";
import type { Appointment } from "@/types";
import { formatSentAt, formatTimeSlot } from "~/lib/formatters";

const t = (key: string, params?: Record<string, unknown>) =>
  key === "appointments.until" ? `until ${params?.time}` : key;

function slot(start: string | null, end: string | null): Appointment {
  return { date: "2026-10-09", start, end } as Appointment;
}

describe("formatTimeSlot", () => {
  test.each([
    ["14:00", "15:00", "d. 09/10, 14:00 - 15:00"],
    ["14:00", null, "d. 09/10, 14:00"],
    [null, "15:00", "d. 09/10, until 15:00"],
    [null, null, "d. 09/10"],
  ])("start %s, end %s with date reads %s", (start, end, expected) => {
    expect(formatTimeSlot(slot(start, end), t, true)).toBe(expected);
  });

  test.each([
    ["14:00", "15:00", "14:00 - 15:00"],
    ["14:00", null, "14:00"],
    [null, "15:00", "until 15:00"],
    [null, null, ""],
  ])("start %s, end %s without date reads %s", (start, end, expected) => {
    expect(formatTimeSlot(slot(start, end), t)).toBe(expected);
  });

  test("no date reads empty", () => {
    expect(formatTimeSlot({ date: null, start: "14:00", end: "15:00" } as Appointment, t, true)).toBe("");
  });
});

describe("formatSentAt", () => {
  test.each([
    ["2026-10-09T13:05:00Z", "09/10 15:05"],
    ["2026-01-31T23:30:00.6564535Z", "01/02 00:30"],
  ])("%s reads %s, in Danish time", (sentAt, expected) => {
    expect(formatSentAt(sentAt)).toBe(expected);
  });
});
