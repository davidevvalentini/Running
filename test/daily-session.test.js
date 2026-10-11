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
