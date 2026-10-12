import { test } from "node:test";
import assert from "node:assert/strict";

import { EMPTY_DETAILS } from "~/lib/llm/appointment-extractor";
import { grade, percentile, summarize } from "./eval-scoring";

const SHOWING = { date: "2027-01-03", startTime: "12:00", endTime: "13:00", cancelled: false };

test("an answer equal to the expected one in every field is correct", () => {
  assert.equal(grade(SHOWING, { ...SHOWING }), "correct");
  assert.equal(grade(EMPTY_DETAILS, { ...EMPTY_DETAILS }), "correct");
});

test("an empty answer where a showing was expected is a miss", () => {
  assert.equal(grade(SHOWING, EMPTY_DETAILS), "miss");
  assert.equal(grade({ ...EMPTY_DETAILS, cancelled: true }, EMPTY_DETAILS), "miss");
});

test("any other difference is wrong: a wrong year, a made-up end time, a showing where none was", () => {
  assert.equal(grade(SHOWING, { ...SHOWING, date: "2026-01-03" }), "wrong");
  assert.equal(grade({ ...SHOWING, endTime: "" }, SHOWING), "wrong");
  assert.equal(grade(EMPTY_DETAILS, SHOWING), "wrong");
  assert.equal(grade(SHOWING, { ...EMPTY_DETAILS, cancelled: true }), "wrong");
});

test("percentiles are nearest-rank over the values", () => {
  const values = [500, 100, 400, 200, 300];
  assert.equal(percentile(values, 50), 300);
  assert.equal(percentile(values, 95), 500);
  assert.equal(percentile([700], 95), 700);
});

test("a summary counts grades over every run and gives latency percentiles and mean tokens", () => {
  const summary = summarize([
    { grade: "correct", ms: 100, inputTokens: 10, outputTokens: 4 },
    { grade: "correct", ms: 300, inputTokens: 30, outputTokens: 8 },
    { grade: "wrong", ms: 200, inputTokens: 20, outputTokens: 6 },
    { grade: "miss", ms: 400, inputTokens: 20, outputTokens: 6 },
  ]);

  assert.deepEqual(summary, { runs: 4, correct: 2, wrong: 1, miss: 1, error: 0, p50Ms: 200, p95Ms: 400, meanInputTokens: 20, meanOutputTokens: 6 });
});

test("a run that threw counts as an error and leaves latency and tokens alone", () => {
  const summary = summarize([
    { grade: "correct", ms: 100, inputTokens: 10, outputTokens: 4 },
    { grade: "error", ms: 9000, inputTokens: 0, outputTokens: 0 },
  ]);

  assert.deepEqual(summary, { runs: 2, correct: 1, wrong: 0, miss: 0, error: 1, p50Ms: 100, p95Ms: 100, meanInputTokens: 10, meanOutputTokens: 4 });
});
