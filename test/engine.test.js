import test from "node:test";
import assert from "node:assert/strict";
import { applyAdjustment, classifyTrainingContext, generatePlan, phaseForWeek, reviewTrainingWeek } from "../src/domain/engine.js";
import { createWorkout, validateRunner } from "../src/domain/models.js";
import { createLocalStore } from "../src/storage/local-store.js";
import { previewActivities } from "../src/import/activities.js";

const runner = overrides => ({
  level: "beginner", weeklyKm: 10, longestRunKm: 6, daysAvailable: 4,
  raceDate: "2027-04-18", hasConcerningSymptoms: false, ...overrides
});

test("validates runner profile and rejects invalid values", () => {
  assert.equal(validateRunner(runner()).ok, true);
  assert.equal(validateRunner(runner({ weeklyKm: -4 })).ok, false);
  assert.equal(validateRunner(runner({ daysAvailable: 0 })).ok, false);
});
test("keeps ability distinct from currently sustainable load", () => {
  const context = classifyTrainingContext(runner({ level: "advanced", weeklyKm: 5, longestRunKm: 4 }));
  assert.equal(context.ability, "advanced");
  assert.equal(context.loadBand, "low");
});
test("generates reproducible structure for same profile and date", () => {
  const a = generatePlan(runner(), { today: "2026-10-11", id: "a" });
  const b = generatePlan(runner(), { today: "2026-10-11", id: "b" });
  assert.deepEqual(a.weeks, b.weeks);
  assert.ok(a.weeks.every(w => w.targetKm >= 0 && w.sessions.length <= 4));
});
test("phase progression ends with a taper and supports long horizons", () => {
  assert.equal(phaseForWeek(1, 16), "base");
  assert.equal(phaseForWeek(8, 16), "build");
  assert.equal(phaseForWeek(13, 16), "specific");
  assert.equal(phaseForWeek(16, 16), "taper");
  assert.equal(generatePlan(runner(), { today: "2026-10-11" }).totalWeeks, 27);
});
test("weekly target matches sum of sessions and respects days available", () => {
  for (const daysAvailable of [1, 2, 3, 4, 6]) {
    const plan = generatePlan(runner({daysAvailable, weeklyKm: 24, longestRunKm: 14, level:"intermediate"}), {today:"2026-10-11"});
    for (const week of plan.weeks) {
      assert.ok(week.sessions.length <= daysAvailable);
      const sum = Math.round(week.sessions.reduce((s, w) => s + w.distanceKm, 0) * 10) / 10;
      assert.equal(sum, week.targetKm);
    }
  }
});
test("refuses to generate a plan with concerning symptoms", () => {
  assert.throws(() => generatePlan(runner({ hasConcerningSymptoms: true }), { today: "2026-10-11" }), /paused/);
});
test("missed sessions are not compensated by future load", () => {
  const review = reviewTrainingWeek({ runner: runner(), plannedKm: 20, completedWorkouts: [], missedSessions: 2 });
  assert.equal(review.decision, "maintain");
  assert.match(review.reasons.join(" "), /not added/);
});
test("pain pauses plan; fatigue reduces load", () => {
  const pain = reviewTrainingWeek({ runner: runner(), plannedKm: 20, completedWorkouts: [], painReported: true });
  assert.equal(pain.decision, "pause");
  assert.equal(applyAdjustment(20, pain).status, "paused");
  const tired = reviewTrainingWeek({ runner: runner(), plannedKm: 20, completedWorkouts: [], unusualFatigue: true });
  assert.equal(tired.decision, "reduce");
});
test("progression requires volume and controlled RPE", () => {
  const good = reviewTrainingWeek({ runner: runner(), plannedKm: 20, completedWorkouts: [{ distanceKm: 18, rpe: 5 }] });
  assert.equal(good.decision, "progress");
  const hard = reviewTrainingWeek({ runner: runner(), plannedKm: 20, completedWorkouts: [{ distanceKm: 19, rpe: 9 }] });
  assert.notEqual(hard.decision, "progress");
});
test("workout validation blocks nonsense", () => {
  assert.throws(() => createWorkout({ distanceKm: -3 }), /distanceKm/);
  assert.throws(() => createWorkout({ durationSec: 120, rpe: 11 }), /rpe/);
  assert.equal(createWorkout({ distanceKm: 5, date: "2026-10-10" }).distanceKm, 5);
});
test("local store recovers safely from corrupt data", () => {
  const values = new Map([["running-planner:v1", "{not json"]]);
  const storage = { getItem: k => values.get(k), setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) };
  assert.deepEqual(createLocalStore(storage).read(), { runners: [], plans: [], workouts: [], adjustments: [] });
});
test("CSV preview parses rows but does not persist", () => {
  const preview = previewActivities({ name: "runs.csv", text: "date,distance_km,duration_sec\n2026-10-01,5,1500", size: 48 });
  assert.equal(preview.count, 1);
  assert.equal(preview.activities[0].distanceKm, 5);
  assert.equal(preview.activities[0].source, "csv");
});
test("import blocks oversized and unsupported files, FIT not silently accepted", () => {
  assert.throws(() => previewActivities({ name: "runs.csv", text: "x", size: 16 * 1024 * 1024 }), /15 MB/);
  assert.throws(() => previewActivities({ name: "bad.exe", text: "x", size: 1 }), /Unsupported/);
  assert.throws(() => previewActivities({ name: "run.fit", text: "binary placeholder", size: 10 }), /FIT decoder/);
});
