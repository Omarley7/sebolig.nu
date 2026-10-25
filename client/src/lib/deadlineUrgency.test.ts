import { afterEach, describe, expect, it, vi } from "vitest";
import i18n from "~/i18n";
import { getDeadlineUrgency } from "~/lib/deadlineUrgency";

const t = i18n.global.t as (key: string, params?: Record<string, unknown>) => string;

afterEach(() => {
  vi.useRealTimers();
});

// Tests run in Danish time (vitest.config.ts), so 25 October 2026 ends daylight saving.
describe("getDeadlineUrgency", () => {
  it("counts calendar days across the end of daylight saving", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 18, 14, 0));

    expect(getDeadlineUrgency("2026-10-28", t)).toEqual({ color: "green", relative: "10 dage" });
    expect(getDeadlineUrgency("2026-10-23", t)).toEqual({ color: "amber", relative: "5 dage" });
  });

  it("turns amber five days out, even across the clock change", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 23, 9, 0));

    expect(getDeadlineUrgency("2026-10-28T00:00:00Z", t)).toEqual({ color: "amber", relative: "5 dage" });
  });

  it("counts calendar days across the start of daylight saving", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2027, 2, 26, 23, 30));

    expect(getDeadlineUrgency("2027-03-30", t)).toEqual({ color: "amber", relative: "4 dage" });
  });

  it("says tomorrow and today at the end", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 27, 23, 59));

    expect(getDeadlineUrgency("2026-10-28", t).relative).toBe("i morgen");
    expect(getDeadlineUrgency("2026-10-27", t)).toEqual({ color: "red", relative: "i dag" });
  });
});
