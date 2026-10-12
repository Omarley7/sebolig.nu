import type { AppointmentDetails } from "~/lib/llm/appointment-extractor";

/**
 * How one answer compares with the hand-written expected one. A wrong date is never acceptable; a
 * false empty (`miss`) is less bad but still not correct. `error` is a call that threw.
 */
export type Grade = "correct" | "wrong" | "miss" | "error";

const isEmpty = (d: AppointmentDetails) => !d.date && !d.startTime && !d.endTime && !d.cancelled;

export function grade(expected: AppointmentDetails, got: AppointmentDetails): Grade {
  const same =
    expected.date === got.date &&
    expected.startTime === got.startTime &&
    expected.endTime === got.endTime &&
    expected.cancelled === got.cancelled;
  if (same) return "correct";
  return isEmpty(got) ? "miss" : "wrong";
}

/** Nearest-rank percentile `p` (0-100) of `values`. */
export function percentile(values: number[], p: number): number {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

export type Run = { grade: Grade; ms: number; inputTokens: number; outputTokens: number };

/** One candidate's runs over every fixture, in one line of the results table. Errored runs count only as errors. */
export function summarize(runs: Run[]) {
  const answered = runs.filter((r) => r.grade !== "error");
  const count = (g: Grade) => runs.filter((r) => r.grade === g).length;
  const mean = (values: number[]) => Math.round(values.reduce((a, b) => a + b, 0) / Math.max(1, values.length));
  return {
    runs: runs.length,
    correct: count("correct"),
    wrong: count("wrong"),
    miss: count("miss"),
    error: count("error"),
    p50Ms: percentile(answered.map((r) => r.ms), 50),
    p95Ms: percentile(answered.map((r) => r.ms), 95),
    meanInputTokens: mean(answered.map((r) => r.inputTokens)),
    meanOutputTokens: mean(answered.map((r) => r.outputTokens)),
  };
}
