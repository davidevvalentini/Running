import test from "node:test";
import assert from "node:assert/strict";
import { predictRaces, evaluateGoal, evaluateBase, proposeFromTests, TEST_DEFS } from "../src/domain/assessment.js";
import { generatePlan, planSummary, validateProfile, assessFeasibility } from "../src/domain/plan.js";
import { sanitize } from "../src/storage/local-store.js";

const t5 = (sec, rpe = 9) => [{ id: "t1", type: "tt5k", date: "2026-10-13", durationSec: sec, rpe }];
const plan = generatePlan({ method: "goandrace", goalTimeSec: 14400, raceDate: "2027-01-31", daysAvailable: 4 }, { today: "2026-10-11" });
const paces = planSummary(plan).paces;

test("il profilo non richiede più km settimanali né lungo recente", () => {
  assert.equal(validateProfile({ goalTimeSec: 14400, raceDate: "2027-01-31", daysAvailable: 4 }).ok, true);
  assert.equal(validateProfile({ goalTimeSec: 14400, raceDate: "2027-01-31", daysAvailable: 4, weeklyKm: -3 }).ok, false);
  assert.equal(validateProfile({ goalTimeSec: 14400, raceDate: "2027-01-31", daysAvailable: 4, recentRaceDistanceKm: 10, recentRaceTimeSec: 30 }).ok, false);
  assert.equal(plan.weeks.length, 16);
});

test("il volume non dipende dall'input: stesso piano con o senza km dichiarati", () => {
  const a = generatePlan({ method: "goandrace", goalTimeSec: 14400, raceDate: "2027-01-31", daysAvailable: 4, weeklyKm: 10, longestRunKm: 5 }, { today: "2026-10-11" });
  assert.equal(planSummary(a).totalKm, planSummary(plan).totalKm);
});

test("previsioni dal test sui 5 km", () => {
  const p = predictRaces(1500);               // 25:00
  assert.ok(Math.abs(p["10k"] - 3127) < 5);
  assert.ok(p.half > 6900 && p.half < 7200); assert.ok(p.marathon > 14500 && p.marathon < 15300);
  assert.ok(p.vma > 12 && p.vma < 13.5);
});

test("valutazione dell'obiettivo", () => {
  assert.equal(evaluateGoal({ goalSec: 14400, distance: "marathon", tests: t5(1500) }).verdict, "ambizioso");
  assert.equal(evaluateGoal({ goalSec: 15000, distance: "marathon", tests: t5(1500) }).verdict, "realistico");
  assert.equal(evaluateGoal({ goalSec: 16200, distance: "marathon", tests: t5(1500) }).verdict, "comodo");
  const far = evaluateGoal({ goalSec: 12600, distance: "marathon", tests: t5(1500) });
  assert.equal(far.verdict, "fuori portata"); assert.equal(far.realisticGoalSec % 60, 0);
  assert.equal(evaluateGoal({ goalSec: 3000, distance: "10k", tests: t5(1500) }).verdict, "ambizioso");
  assert.equal(evaluateGoal({ goalSec: 14400, distance: "marathon", tests: [] }), null);
  assert.ok(evaluateGoal({ goalSec: 14400, distance: "marathon", tests: t5(1500, 6) }).notes.some(n => n.includes("prudente")));
});

test("base aerobica dal test di 30 minuti", () => {
  const b = (km, rpe) => [{ id: "b", type: "base30", date: "2026-10-12", distanceKm: km, rpe }];
  assert.equal(evaluateBase({ z2PaceSec: paces["Z2-CLR"], tests: b(4.6, 4) }).level, "in linea");     // 6'31"/km
  assert.equal(evaluateBase({ z2PaceSec: paces["Z2-CLR"], tests: b(3.5, 4) }).cautious, true);
  assert.equal(evaluateBase({ z2PaceSec: paces["Z2-CLR"], tests: b(4.7, 8) }).cautious, true);
  assert.equal(evaluateBase({ z2PaceSec: paces["Z2-CLR"], tests: [] }), null);
});

test("proposte dai test: obiettivo e partenza cauta, una sola volta", () => {
  const tests = [...t5(1500), { id: "b", type: "base30", date: "2026-10-12", distanceKm: 3.2, rpe: 6 }];
  const props = proposeFromTests({ plan, goalSec: 12600, distance: "marathon", tests, paces, today: "2026-10-14" });
  assert.deepEqual(props.map(p => p.kind).sort(), ["goal", "start-cautious"]);
  const goal = props.find(p => p.kind === "goal"); assert.ok(goal.newGoalSec > 12600);
  assert.equal(props.find(p => p.kind === "start-cautious").effect.volumeFactor, 0.85);
  assert.equal(proposeFromTests({ plan, goalSec: 12600, distance: "marathon", tests, paces, today: "2026-10-14", dismissed: props.map(p => p.id) }).length, 0);
  assert.equal(proposeFromTests({ plan, goalSec: 12600, distance: "marathon", tests, paces, today: "2026-12-01" }).some(p => p.kind === "start-cautious"), false);
  assert.equal(proposeFromTests({ plan, goalSec: 15000, distance: "marathon", tests: t5(1500), paces, today: "2026-10-14" }).length, 0);
});

test("fattibilità: senza gara recente né test rimanda ai test iniziali", () => {
  assert.ok(assessFeasibility({ goalTimeSec: 14400 }, null).notes.some(n => n.includes("test iniziali")));
  assert.ok(assessFeasibility({ goalTimeSec: 14400, recentRaceDistanceKm: 5, recentRaceTimeSec: 1500 }, null).level !== "n/d");
});

test("stato salvato: i test validi restano, quelli sporchi no", () => {
  const s = sanitize({ tests: [{ id: "a", type: "base30", date: "2026-10-12", distanceKm: 4 }, { id: "b", type: "tt5k", date: "2026-10-13", durationSec: 1500 }, { id: "c", type: "boh", date: "2026-10-13" }, { id: "d", type: "tt5k", date: "x", durationSec: 1 }, null] });
  assert.deepEqual(s.tests.map(t => t.id), ["a", "b"]);
  assert.equal(TEST_DEFS.length, 2);
});
