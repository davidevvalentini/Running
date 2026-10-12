// Stima del ritmo gara dai dati e correzione dopo il lunghissimo da 36 km.
import test from "node:test";
import assert from "node:assert/strict";
import { generatePlan } from "../src/domain/plan.js";
import { estimateMarathon } from "../src/domain/rg.js";
import { proposeRgFromLongRun } from "../src/domain/adapt.js";

const TODAY = "2026-10-12", RACE = "2027-03-07";
const gen = (over = {}, opts = {}) => generatePlan({ raceDate: RACE, daysAvailable: 6, ...over }, { today: TODAY, ...opts });

test("mezza × 2,2: il RG deriva dalla gara recente, non dall'obiettivo", () => {
  const p = gen({ recentRaceDistanceKm: 21.0975, recentRaceTimeSec: 5700, goalTimeSec: 11400 }); // mezza 1h35', obiettivo 3h10'
  assert.equal(p.goalTimeSec, Math.round(5700 * 2.2 / 60) * 60);
  assert.equal(p.targetTimeSec, 11400);
  assert.equal(p.estimate.source, "mezza");
  assert.ok(p.warnings.some(w => /più veloce della stima/.test(w)));
});

test("10 km: ritmo = 10k + 30\"/km; prima maratona +20\"/km", () => {
  const a = estimateMarathon({ recentRaceDistanceKm: 10, recentRaceTimeSec: 2700 });   // 4'30"/km → 5'00"
  assert.equal(a.sec, Math.round(300 * 42.195 / 60) * 60);
  const b = estimateMarathon({ recentRaceDistanceKm: 10, recentRaceTimeSec: 2700, firstMarathon: true });
  assert.equal(b.sec - a.sec, Math.round(20 * 42.195 / 60) * 60);
});

test("senza dati: livello → piano provvisorio con avviso 'prima una mezza'", () => {
  const p = gen({ levelBand: "unknown" });
  assert.equal(p.provisional, true);
  assert.equal(p.estimate.source, "livello");
  assert.ok(p.warnings.some(w => /Prima una mezza/.test(w)));
  const known = gen({ levelBand: "45-50" });
  assert.ok(known.goalTimeSec < p.goalTimeSec);
});

test("test sui 5 km usato come dato; una mezza non genera l'avviso", () => {
  const withTest = gen({}, { tests: [{ type: "tt5k", date: "2026-10-10", durationSec: 1320 }] });
  assert.equal(withTest.estimate.source, "test5k");
  assert.equal(withTest.provisional, false);
  assert.equal(gen({ recentRaceDistanceKm: 21.0975, recentRaceTimeSec: 6000 }).warnings.some(w => /Prima una mezza/.test(w)), false);
});

test("senza obiettivo né dati il piano non si genera", () => {
  assert.throws(() => gen(), /gara recente|livello/);
});

const feedbackFor = (plan, over) => {
  const w = plan.weeks.find(x => x.name === "Lunghissimo da 36 km"), date = w.days[6].date;
  return [{ id: "f", planId: plan.id, date, kind: "long", completion: "done", actualKm: 36, rpe: 6, plannedAvgPaceSec: plan.goalPaceSec + 6, durationSec: 36 * (plan.goalPaceSec + 6), ...over }];
};

test("dopo i 36 km: più lento del previsto → propone un RG più lento", () => {
  const plan = gen({ goalTimeSec: 12600 }), g = plan.goalPaceSec;
  const fb = feedbackFor(plan, { durationSec: 36 * (g + 6 + 12), rpe: 8 });
  const [p] = proposeRgFromLongRun({ plan, feedback: fb, today: fb[0].date });
  assert.equal(p.kind, "goal");
  assert.ok(p.newGoalSec > plan.goalTimeSec);
});

test("dopo i 36 km: in linea → nessuna proposta; molto più veloce e facile → RG più veloce", () => {
  const plan = gen({ goalTimeSec: 12600 }), g = plan.goalPaceSec;
  assert.deepEqual(proposeRgFromLongRun({ plan, feedback: feedbackFor(plan, {}), today: "2027-01-20" }), []);
  const fast = feedbackFor(plan, { durationSec: 36 * (g + 6 - 10), rpe: 5 });
  const [p] = proposeRgFromLongRun({ plan, feedback: fast, today: fast[0].date });
  assert.ok(p.newGoalSec < plan.goalTimeSec);
  assert.deepEqual(proposeRgFromLongRun({ plan, feedback: fast, today: fast[0].date, dismissed: [p.id] }), []);
});

test("accettare la correzione rigenera il piano con il nuovo RG anche se c'è una gara recente", () => {
  const profile = { recentRaceDistanceKm: 21.0975, recentRaceTimeSec: 5700, raceDate: RACE, daysAvailable: 6 };
  const p = generatePlan({ ...profile, rgTimeSec: 13200, goalTimeSec: 13200 }, { today: TODAY });
  assert.equal(p.goalTimeSec, 13200);
});
