import test from "node:test";
import assert from "node:assert/strict";
import { applyAdjustment, classifyTrainingContext, estimatePaceZones, generatePlan, getLatestCompletedPlanWeek, phaseForWeek, reviewTrainingWeek } from "../src/domain/engine.js";
import { createWorkout, isValidISODate, validateRunner } from "../src/domain/models.js";
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
test("CSV import normalizes common metre distances and filters invalid outliers", () => {
  const preview = previewActivities({ name: "runs.csv", text: "Date,Distance,Moving Time\n2026-10-01,5000,1800\n2026-10-02,8.5,2400\n2026-10-03,900000,1200", size: 90 });
  assert.equal(preview.count, 2);
  assert.equal(preview.activities[0].distanceKm, 5);
  assert.equal(preview.activities[1].distanceKm, 8.5);
});
test("import blocks oversized and unsupported files, FIT not silently accepted", () => {
  assert.throws(() => previewActivities({ name: "runs.csv", text: "x", size: 16 * 1024 * 1024 }), /15 MB/);
  assert.throws(() => previewActivities({ name: "bad.exe", text: "x", size: 1 }), /Unsupported/);
  assert.throws(() => previewActivities({ name: "run.fit", text: "binary placeholder", size: 10 }), /FIT decoder/);
});

test("rejects impossible calendar dates instead of accepting Date.parse normalization", () => {
  assert.equal(isValidISODate("2026-02-28"), true);
  assert.equal(isValidISODate("2026-02-31"), false);
  assert.equal(validateRunner(runner({ raceDate: "2027-02-29" })).ok, false);
  assert.throws(() => createWorkout({ distanceKm: 5, date: "2026-02-31" }), /real calendar date/);
  assert.throws(() => generatePlan(runner(), { today: "2026-02-31" }), /real calendar dates/);
});
test("first week never auto-increases load and recovery/taper are anchored to build load", () => {
  const plan = generatePlan(runner({weeklyKm: 30, longestRunKm: 16, level: "intermediate"}), {today:"2026-10-11"});
  assert.equal(plan.weeks[0].targetKm, 30);
  const recovery = plan.weeks.find(w => w.recovery);
  assert.ok(recovery);
  const before = plan.weeks[recovery.week - 2];
  assert.ok(recovery.targetKm <= before.targetKm);
  const peak = Math.max(...plan.weeks.filter(w => w.phase !== "taper").map(w => w.targetKm));
  const taper = plan.weeks.filter(w => w.phase === "taper");
  assert.equal(taper.length, 2);
  assert.ok(taper[0].targetKm <= peak * 0.75 + 0.1);
  assert.ok(taper[1].targetKm <= peak * 0.55 + 0.1);
});
test("long run progression does not jump by more than one kilometre in a normal week", () => {
  const plan = generatePlan(runner({weeklyKm: 28, longestRunKm: 14, level:"intermediate"}), {today:"2026-10-11"});
  for (let i = 1; i < plan.weeks.length; i++) {
    const prev = plan.weeks[i-1], curr = plan.weeks[i];
    if (!curr.recovery && curr.phase !== "taper" && prev.phase !== "taper") {
      const prevLong = prev.sessions.find(s => s.type === "long")?.distanceKm ?? 0;
      const currLong = curr.sessions.find(s => s.type === "long")?.distanceKm ?? 0;
      assert.ok(currLong <= prevLong + 1.1, `week ${curr.week}: ${prevLong} -> ${currLong}`);
    }
  }
});


test("one available day never compresses the whole weekly target into one run", () => {
  const plan = generatePlan(runner({
    weeklyKm: 35, longestRunKm: 12, daysAvailable: 1, level: "intermediate"
  }), { today: "2026-10-11" });
  assert.ok(plan.warnings.some(w => /one running day/i.test(w)));
  for (const week of plan.weeks) {
    assert.ok(week.sessions.length <= 1);
    assert.ok(week.targetKm <= 12, `week ${week.week} unexpectedly prescribes ${week.targetKm} km in one outing`);
    assert.equal(week.targetKm, Math.round(week.sessions.reduce((sum, s) => sum + s.distanceKm, 0) * 10) / 10);
  }
});

test("review rejects malformed missed-session counts, workouts and RPE values", () => {
  assert.throws(() => reviewTrainingWeek({
    runner: runner(), plannedKm: 20, completedWorkouts: [], missedSessions: -1
  }), /missedSessions/);
  assert.throws(() => reviewTrainingWeek({
    runner: runner(), plannedKm: 20, completedWorkouts: [null]
  }), /must be an object/);
  assert.throws(() => reviewTrainingWeek({
    runner: runner(), plannedKm: 20, completedWorkouts: [{ distanceKm: 5, rpe: 11 }]
  }), /RPE/);
});

test("stress matrix preserves plan invariants across contrasting profiles", () => {
  const profiles = [
    runner({ weeklyKm: 0, longestRunKm: 0, daysAvailable: 3 }),
    runner({ weeklyKm: 10, longestRunKm: 6, daysAvailable: 2 }),
    runner({ level: "intermediate", weeklyKm: 25, longestRunKm: 12, daysAvailable: 4 }),
    runner({ level: "advanced", weeklyKm: 55, longestRunKm: 26, daysAvailable: 6 }),
    runner({ level: "advanced", weeklyKm: 300, longestRunKm: 100, daysAvailable: 7 })
  ];
  for (const profile of profiles) {
    const plan = generatePlan(profile, { today: "2026-10-11" });
    assert.ok(plan.weeks.length > 0);
    for (const week of plan.weeks) {
      assert.ok(week.targetKm >= 0 && Number.isFinite(week.targetKm));
      assert.ok(week.sessions.length <= profile.daysAvailable);
      for (const session of week.sessions) {
        assert.ok(session.distanceKm >= 0 && Number.isFinite(session.distanceKm));
      }
      const total = Math.round(week.sessions.reduce((sum, s) => sum + s.distanceKm, 0) * 10) / 10;
      assert.equal(week.targetKm, total);
    }
  }
});


test("weekly review selects the latest completed plan week, not an in-progress week", () => {
  const plan = {
    startDate: "2026-10-01",
    weeks: [
      { week: 1, targetKm: 20 },
      { week: 2, targetKm: 22 },
      { week: 3, targetKm: 24 }
    ]
  };
  assert.equal(getLatestCompletedPlanWeek(plan, "2026-10-07"), null);
  assert.deepEqual(getLatestCompletedPlanWeek(plan, "2026-10-08"), {
    week: { week: 1, targetKm: 20 }, weekIndex: 0,
    startDate: "2026-10-01", endDate: "2026-10-07"
  });
  assert.deepEqual(getLatestCompletedPlanWeek(plan, "2026-10-15"), {
    week: { week: 2, targetKm: 22 }, weekIndex: 1,
    startDate: "2026-10-08", endDate: "2026-10-14"
  });
  assert.equal(getLatestCompletedPlanWeek(plan, "2026-10-29"), null);
});

test("completed plan week lookup rejects invalid plans and dates", () => {
  assert.throws(() => getLatestCompletedPlanWeek(null, "2026-10-11"), /valid startDate/);
  assert.throws(() => getLatestCompletedPlanWeek({ startDate: "2026-02-31", weeks: [] }, "2026-10-11"), /valid startDate/);
  assert.throws(() => getLatestCompletedPlanWeek({ startDate: "2026-10-01", weeks: [] }, "2026-02-31"), /valid startDate/);
});

test("quality sessions expose a clear warm-up, main set and cool-down matching the total distance", () => {
  const plan = generatePlan(runner({
    level: "intermediate", weeklyKm: 40, longestRunKm: 18, daysAvailable: 4
  }), { today: "2026-10-11" });
  const quality = plan.weeks.flatMap(week => week.sessions)
    .find(session => ["threshold", "intervals", "marathon_pace"].includes(session.type));
  assert.ok(quality, "expected at least one quality session in the plan");
  assert.ok(quality.structure);
  assert.ok(quality.structure.warmupKm >= 0);
  assert.ok(quality.structure.mainKm >= 0);
  assert.ok(quality.structure.cooldownKm >= 0);
  const parts = Math.round((quality.structure.warmupKm + quality.structure.mainKm + quality.structure.cooldownKm) * 10) / 10;
  assert.equal(parts, quality.distanceKm);
  assert.ok(quality.structure.mainSet.length > 10);
});

test("every planned session has a day and actionable session instructions", () => {
  const plan = generatePlan(runner({
    level: "intermediate", weeklyKm: 40, longestRunKm: 18, daysAvailable: 4
  }), { today: "2026-10-11" });
  for (const week of plan.weeks) {
    assert.equal(new Set(week.sessions.map(s => s.day)).size, week.sessions.length);
    for (const session of week.sessions) {
      assert.ok(session.day);
      assert.ok(session.structure?.mainSet?.length > 20);
      const parts = Math.round((session.structure.warmupKm + session.structure.mainKm + session.structure.cooldownKm) * 10) / 10;
      assert.equal(parts, session.distanceKm, `${session.day} ${session.type}: components must match total distance`);
    }
  }
});

test("quality session instructions only prescribe specific pace when race pace is validated", () => {
  const plan = generatePlan(runner({
    level: "advanced", weeklyKm: 50, longestRunKm: 22, daysAvailable: 4
  }), { today: "2026-10-11" });
  const marathonPace = plan.weeks.flatMap(w => w.sessions).find(s => s.type === "marathon_pace");
  if (marathonPace) assert.match(marathonPace.structure.mainSet, /gara recente|valutazione attendibile/);
});

test("race-based pace estimates are optional, reproducible and attached to plans", () => {
  assert.equal(estimatePaceZones(runner()), null);
  const athlete = runner({ recentRaceDistanceKm: 10, recentRaceTimeSec: 3000 });
  const zones = estimatePaceZones(athlete);
  assert.ok(zones.labels.easy.includes("/km"));
  assert.ok(zones.labels.threshold.includes("/km"));
  assert.ok(zones.labels.intervals.includes("/km"));
  const plan = generatePlan(athlete, { today: "2026-10-11" });
  assert.deepEqual(plan.paceZones, zones);
  const quality = plan.weeks.flatMap(w => w.sessions).find(s => s.type === "threshold");
  if (quality) assert.match(quality.structure.mainSet, /riferimento indicativo/);
});

test("race result fields must be paired and within supported distance range", () => {
  assert.equal(validateRunner(runner({ recentRaceDistanceKm: 10, recentRaceTimeSec: 3000 })).ok, true);
  assert.equal(validateRunner(runner({ recentRaceDistanceKm: 10 })).ok, false);
  assert.equal(validateRunner(runner({ recentRaceDistanceKm: 8, recentRaceTimeSec: 3000 })).ok, false);
  assert.equal(validateRunner(runner({ recentRaceDistanceKm: 5, recentRaceTimeSec: 999999 })).ok, false);
});

test("quality instructions fit the available main block and do not force too many reps", () => {
  const athlete = runner({weeklyKm: 38, longestRunKm: 18, level: "intermediate"});
  const plan = generatePlan(athlete, {today:"2026-10-11"});
  for (const session of plan.weeks.flatMap(w => w.sessions)) {
    if (session.type === "intervals") {
      const reps = Number(session.structure.mainSet.match(/Parte centrale: (\\d+) × 400 m/)?.[1] ?? 0);
      if (reps) assert.ok(reps * 0.6 <= session.structure.mainKm + 0.2);
    }
    if (session.type === "threshold") {
      const reps = Number(session.structure.mainSet.match(/Parte centrale: (\\d+) × 1 km/)?.[1] ?? 0);
      if (reps) assert.ok(reps * 1.4 - 0.4 <= session.structure.mainKm + 0.1);
    }
  }
});

test("specific long runs only add a controlled finish for established runners", () => {
  const established = generatePlan(runner({weeklyKm: 45, longestRunKm: 20, level:"advanced"}), {today:"2026-10-11"});
  const specificLongs = established.weeks.filter(w=>w.phase==="specific"&&!w.recovery).flatMap(w=>w.sessions).filter(s=>s.type==="long"&&s.distanceKm>=18);
  if (specificLongs.length) assert.ok(specificLongs.every(s=>/Lungo progressivo controllato/.test(s.structure.mainSet)));
  const beginner = generatePlan(runner({weeklyKm: 10, longestRunKm: 6, level:"beginner"}), {today:"2026-10-11"});
  assert.ok(beginner.weeks.flatMap(w=>w.sessions).filter(s=>s.type==="long").every(s=>!/Lungo progressivo controllato/.test(s.structure.mainSet)));
});

test("quality sessions expose quantifiable repetitions and recovery distances", () => {
  const plan = generatePlan(runner({
    level: "advanced", weeklyKm: 55, longestRunKm: 24, daysAvailable: 5
  }), { today: "2026-10-11" });
  const quality = plan.weeks.flatMap(week => week.sessions)
    .filter(session => ["intervals", "threshold"].includes(session.type));
  assert.ok(quality.length > 0);
  for (const session of quality) {
    const set = session.structure.setDetails;
    assert.ok(set);
    assert.equal(set.repetitions >= 1, true);
    assert.ok(set.workDistanceKm > 0);
    assert.ok(set.recoveryDistanceKm > 0);
    assert.equal(set.recoveryCount, session.type === "threshold" ? set.repetitions - 1 : set.repetitions - 1);
    const fastDistance = set.repetitions * set.workDistanceKm;
    const recoveryDistance = set.recoveryCount * set.recoveryDistanceKm;
    assert.ok(fastDistance + recoveryDistance <= session.structure.mainKm + 0.01);
  }
});
