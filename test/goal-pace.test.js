import test from "node:test";
import assert from "node:assert/strict";
import { generatePlan } from "../src/domain/engine.js";

test("keeps marathon goal pace distinct from race-result pace estimates", () => {
  const plan = generatePlan({
    level: "advanced", weeklyKm: 50, longestRunKm: 24, daysAvailable: 5,
    raceDate: "2027-04-18", hasConcerningSymptoms: false,
    goalMarathonTimeSec: 4 * 3600
  }, { today: "2026-10-11" });
  assert.equal(plan.goalMarathonTimeSec, 14400);
  assert.ok(Math.abs(plan.targetMarathonPaceSecPerKm - 14400 / 42.195) < 0.001);
  const goalSession = plan.weeks.flatMap(week => week.sessions)
    .find(session => session.type === "marathon_pace");
  assert.ok(goalSession);
  assert.match(goalSession.structure.mainSet, /Il ritmo obiettivo non dimostra/);
  assert.match(goalSession.structure.mainSet, /5:41\/km/);
});
