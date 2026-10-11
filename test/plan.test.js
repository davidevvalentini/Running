import test from "node:test";
import assert from "node:assert/strict";
import { generatePlan, planSummary, requiredAbilities } from "../src/domain/plan.js";
import { measure, notation, expandSteps, run, reps, scaleSession } from "../src/domain/session.js";
import { buildPaces, fmtDuration } from "../src/domain/paces.js";
import { effectiveSession, applyAdjustment, proposeFromFeedback, proposeFromWeek, locate } from "../src/domain/adapt.js";

const profile = { goalTimeSec: 4 * 3600, raceDate: "2027-01-31", daysAvailable: 4, weeklyKm: 30, longestRunKm: 16 };
const plan = generatePlan(profile, { today: "2026-10-11" });

test("ritmi a 4h00 come nel riferimento", () => {
  const p = buildPaces(4 * 3600 / 42.195);
  assert.equal(p.GARA, 341); assert.equal(p["Z2-CLR"], 390); assert.equal(p.LQ, 360);
  assert.equal(p.RipM, 300); assert.equal(p.REC_M, 400); assert.equal(p.DEF, 425);
});

test("ripetute: totali e tempo (6 x 800 m)", () => {
  const p = buildPaces(4 * 3600 / 42.195);
  const steps = [run("RIS", 3), reps(6, "RipM", 0.8, "REC_M", 150), run("DEF", 1)];
  const m = measure(steps, p);
  assert.equal(m.km, 11.1); assert.equal(fmtDuration(m.sec), "1h05'50\"");
  assert.equal(notation(steps), `3 km RIS + 6 x (0,8 km RipM + 2'30" REC_M) + 1 km DEF`);
  assert.equal(expandSteps(steps, p).length, 2 + 12);
});

test("piano 4h00 coincide col riferimento di volume", () => {
  const s = planSummary(plan);
  assert.equal(plan.totalWeeks, 16); assert.equal(plan.startDate, "2026-10-12");
  assert.equal(s.totalKm, 821.8); assert.equal(s.avgKm, 51.4); assert.equal(s.peakWeek, 13); assert.equal(s.peakKm, 64.7);
});

test("la gara cade nell'ultimo giorno e i giorni sono 7 per settimana", () => {
  const last = plan.weeks.at(-1);
  assert.equal(last.days[6].date, "2027-01-31"); assert.equal(last.days[6].session.kind, "race");
  assert.ok(plan.weeks.every(w => w.days.length === 7));
});

test("giorni a settimana rispettati", () => {
  for (const d of [3, 4, 5, 6]) {
    const p = generatePlan({ ...profile, daysAvailable: d }, { today: "2026-10-11" });
    assert.equal(p.weeks[2].days.filter(x => x.session).length, d);
    assert.equal(p.weeks[2].days[6].session.kind, "long");
  }
});

test("regola delle 3 ore sul lungo", () => {
  const slow = generatePlan({ ...profile, goalTimeSec: 5 * 3600 }, { today: "2026-10-11" });
  const fast = generatePlan({ ...profile, goalTimeSec: 3 * 3600 }, { today: "2026-09-20" });
  for (const p of [slow, fast]) {
    const paces = buildPaces(p.racePaceSec);
    for (const w of p.weeks.slice(0, -1)) { const m = measure(w.days[6].session.steps, paces); assert.ok(m.sec <= 10800 + 600 || m.km <= 30, `w${w.week}`); }
  }
  assert.equal(fast.totalWeeks, 18);
});

test("piano accorciato quando mancano settimane", () => {
  const p = generatePlan(profile, { today: "2026-12-06" });
  assert.equal(p.totalWeeks, 8); assert.ok(p.warnings.length >= 2);
  assert.equal(p.weeks.at(-1).days[6].session.kind, "race");
});

test("validazioni", () => {
  assert.throws(() => generatePlan({ ...profile, goalTimeSec: 100 }, { today: "2026-10-11" }));
  assert.throws(() => generatePlan({ ...profile, daysAvailable: 2 }, { today: "2026-10-11" }));
  assert.throws(() => generatePlan({ ...profile, hasConcerningSymptoms: true }, { today: "2026-10-11" }));
  assert.throws(() => generatePlan(profile, { today: "2027-01-20" }));
});

test("capacità richieste crescono con l'obiettivo", () => {
  assert.ok(requiredAbilities(3 * 3600).vma > requiredAbilities(4 * 3600).vma);
});

test("aggiustamento: riduzione e sostituzione qualità, senza recupero km", () => {
  const w = plan.weeks[5], q = w.days[2];
  const base = effectiveSession(plan, q);
  const adj = applyAdjustment(plan, { id: "x", title: "t", reason: "r", effect: { fromDate: q.date, toDate: q.date, volumeFactor: 0.85, qualityToEasy: true } });
  const eff = effectiveSession(adj, q);
  assert.equal(eff.kind, "easy"); assert.ok(eff.km < base.km);
  assert.equal(effectiveSession(adj, w.days[4]).km, effectiveSession(plan, w.days[4]).km);
  assert.equal(adj.version, 2);
});

test("scorrimento ritmi", () => {
  const q = plan.weeks[2].days[2];
  const slowed = applyAdjustment(plan, { id: "p", title: "t", reason: "r", effect: { fromDate: q.date, toDate: null, paceShiftSec: 10 } });
  assert.ok(effectiveSession(slowed, q).sec > effectiveSession(plan, q).sec);
});

test("proposte dal feedback", () => {
  const d = "2026-11-10", base = { date: d, planId: plan.id, kind: "quality", completion: "completed", fatigue: false, pain: false, rpe: 7 };
  assert.equal(proposeFromFeedback({ plan, feedback: [base], today: d }).length, 0);
  assert.equal(proposeFromFeedback({ plan, feedback: [{ ...base, rpe: 10 }], today: d })[0].kind, "reduce");
  assert.equal(proposeFromFeedback({ plan, feedback: [{ ...base, fatigue: true }], today: d })[0].effect.qualityToEasy, true);
  assert.equal(proposeFromFeedback({ plan, feedback: [{ ...base, pain: true }], today: d })[0].kind, "pause");
  const skips = [1, 2].map(i => ({ ...base, date: `2026-11-0${i + 5}`, completion: "skipped", rpe: null }));
  assert.equal(proposeFromFeedback({ plan, feedback: skips, today: d })[0].kind, "skips");
  const slow = [1, 2].map(i => ({ ...base, date: `2026-11-0${i + 7}`, actualKm: 10, durationSec: 3500, plannedAvgPaceSec: 330, rpe: 9 }));
  assert.equal(proposeFromFeedback({ plan, feedback: slow, today: d })[0].kind, "pace_down");
  assert.equal(proposeFromFeedback({ plan, feedback: [{ ...base, rpe: 10 }], today: d, dismissed: ["reduce:" + d] }).length, 0);
});

test("proposta da aderenza settimanale", () => {
  assert.equal(proposeFromWeek({ plan, workouts: [], today: "2026-10-20" }).length, 1);
  const w1 = plan.weeks[0].days.filter(x => x.session).map(x => ({ date: x.date, distanceKm: 9.8 }));
  assert.equal(proposeFromWeek({ plan, workouts: w1, today: "2026-10-20" }).length, 0);
});

test("locate", () => {
  assert.equal(locate(plan, "2026-10-11").state, "before");
  assert.equal(locate(plan, "2026-10-14").day.session.kind, "quality");
  assert.equal(locate(plan, "2027-02-01").state, "after");
});

test("scaleSession non tocca riscaldamento/defaticamento", () => {
  const s = scaleSession(plan.weeks[5].days[2].session, 0.85);
  assert.equal(s.steps[0].km, 2); assert.equal(s.steps[2].km, 1); assert.equal(s.steps[1].n, 6);
});
