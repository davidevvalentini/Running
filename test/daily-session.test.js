import test from "node:test";
import assert from "node:assert/strict";
import { getDailySessionContext, suggestDailyAdjustment } from "../src/domain/daily-session.js";

const plan = {
  startDate: "2026-10-12",
  weeks: [
    { week: 1, phase: "base", sessions: [
      { day: "Martedì", type: "easy", distanceKm: 5 },
      { day: "Giovedì", type: "long", distanceKm: 8 }
    ]},
    { week: 2, phase: "build", sessions: [{ day: "Martedì", type: "easy", distanceKm: 6 }]}
  ]
};

test("selects today's planned session and next session within the plan week", () => {
  const tuesday = getDailySessionContext(plan, "2026-10-13");
  assert.equal(tuesday.session.type, "easy");
  assert.equal(tuesday.weekNumber, 1);
  assert.equal(tuesday.nextSession.day, "Giovedì");
  const wednesday = getDailySessionContext(plan, "2026-10-14");
  assert.equal(wednesday.session, null);
  assert.equal(wednesday.nextSession.type, "long");
});

test("does not offer weekday sessions that fall before a midweek plan start", () => {
  const midweekPlan = {
    startDate: "2026-10-15",
    weeks: [
      { week: 1, phase: "base", sessions: [
        { day: "Martedì", type: "easy", distanceKm: 5 },
        { day: "Giovedì", type: "long", distanceKm: 8 },
        { day: "Sabato", type: "easy", distanceKm: 4 }
      ]}
    ]
  };
  const thursday = getDailySessionContext(midweekPlan, "2026-10-15");
  assert.equal(thursday.session.type, "long");
  assert.equal(thursday.nextSession.day, "Sabato");
  const sunday = getDailySessionContext(midweekPlan, "2026-10-18");
  assert.equal(sunday.session, null);
  assert.equal(sunday.nextSession.day, "Martedì");
});

test("returns no context before plan start and identifies plan completion", () => {
  assert.equal(getDailySessionContext(plan, "2026-10-11"), null);
  assert.equal(getDailySessionContext(plan, "2026-10-26").finished, true);
});

test("pain takes priority and recommends pausing without diagnosis", () => {
  const result = suggestDailyAdjustment({ completion: "completed", plannedKm: 8, actualKm: 8, rpe: 4, pain: true });
  assert.equal(result.decision, "pause");
  assert.match(result.message, /valutazione professionale/);
});

test("skipped sessions are not recovered and a hard effort does not trigger progression", () => {
  assert.match(suggestDailyAdjustment({ completion: "skipped", plannedKm: 8 }).message, /Non recuperare/);
  assert.equal(suggestDailyAdjustment({ completion: "completed", plannedKm: 8, actualKm: 8, rpe: 9 }).decision, "reduce_or_recover");
});

test("only well-tolerated sessions recommend maintaining rather than automatic progression", () => {
  const result = suggestDailyAdjustment({ completion: "completed", plannedKm: 8, actualKm: 8, rpe: 5 });
  assert.equal(result.decision, "maintain");
  assert.match(result.message, /non basta per aumentare/);
});

test("rejects malformed feedback", () => {
  assert.throws(() => suggestDailyAdjustment({ completion: "unknown", plannedKm: 5 }), /completion/);
  assert.throws(() => suggestDailyAdjustment({ completion: "completed", plannedKm: -1 }), /plannedKm/);
});

test("summarizes daily feedback within a weekly review range", async () => {
  const { summarizeDailyFeedback } = await import("../src/domain/daily-session.js");
  const result = summarizeDailyFeedback([
    { date: "2026-10-05", completion: "skipped", rpe: null },
    { date: "2026-10-06", completion: "completed", rpe: 8, fatigue: false },
    { date: "2026-10-12", completion: "completed", rpe: 3, pain: true }
  ], "2026-10-05", "2026-10-11");
  assert.deepEqual(result, { painReported: false, unusualFatigue: true, skippedSessions: 1, highEffortSessions: 1 });
});

test("rejects invalid daily feedback review ranges", async () => {
  const { summarizeDailyFeedback } = await import("../src/domain/daily-session.js");
  assert.throws(() => summarizeDailyFeedback({}, "2026-10-01", "2026-10-07"), /array/);
  assert.throws(() => summarizeDailyFeedback([], "2026-10-08", "2026-10-01"), /date range/);
});
