// Simulazioni: migliaia di piani e percorsi di feedback casuali contro le regole che un piano sensato deve rispettare.
import test from "node:test";
import assert from "node:assert/strict";
import { generatePlan, planSummary, DISTANCES, wdShort, addDays } from "../src/domain/plan.js";
import { measure } from "../src/domain/session.js";
import { effectiveSession, locate, applyAdjustment, proposeFromFeedback, proposeFromWeek, moveSession, moveTargets, paceShiftFor, MAX_SHIFT } from "../src/domain/adapt.js";
import { sanitize, validPlan } from "../src/storage/local-store.js";
import { encodeWorkoutFit, decodeFit, decodeFitActivities, crc16 } from "../src/import/fit.js";
import { buildPaces } from "../src/domain/paces.js";
import { reps, run } from "../src/domain/session.js";

const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const WD = ["LU", "MA", "ME", "GI", "VE", "SA", "DO"];
const wdIndex = iso => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;

test("piani: regole valide per distanza × obiettivo × giorni × anticipo × giorno di gara", () => {
  const today = "2026-10-11"; let count = 0;
  for (const [dist, cfg] of Object.entries(DISTANCES)) {
    const goals = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round((cfg.minGoal + (cfg.maxGoal - cfg.minGoal) * f) / 60) * 60);
    for (const goal of goals) for (const days of [3, 4, 5, 6]) for (const ahead of [29, 80, 112, 200]) for (const raceWd of [1, 5, 6]) {
      let race = addDays(today, ahead); while (wdIndex(race) !== raceWd) race = addDays(race, 1);
      const p = generatePlan({ distance: dist, goalTimeSec: goal, raceDate: race, daysAvailable: days, weeklyKm: 30, longestRunKm: 16 }, { today });
      const tag = `${dist} ${goal} d${days} +${ahead} wd${raceWd}`; count++;
      const paces = planSummary(p).paces;
      assert.ok(p.startDate >= today, tag);
      assert.equal(p.weeks.at(-1).days[6].date, race, tag);
      assert.ok(validPlan(p), "validPlan " + tag);
      p.weeks.forEach((w, wi) => {
        assert.equal(w.days.length, 7);
        w.days.forEach((d, di) => {
          assert.equal(d.date, addDays(p.startDate, wi * 7 + di), tag);
          assert.equal(wdShort(d.date), WD[wdIndex(d.date)], tag);
          if (!d.session) return;
          const m = measure(d.session.steps, paces);
          assert.ok(m.km > 0 && Number.isFinite(m.sec), tag);
          assert.ok(m.avgPaceSec > p.goalPaceSec * 0.72 && m.avgPaceSec < p.goalPaceSec * 1.6, `${tag} avg ${m.avgPaceSec}`);
          assert.equal(d.session.kind === "race", wi === p.weeks.length - 1 && di === 6, tag);
        });
        if (wi < p.weeks.length - 1) assert.equal(w.days.filter(d => d.session).length, days, tag);
      });
      for (const w of p.weeks.slice(0, -1)) {
        const m = measure(w.days[6].session.steps, paces);
        assert.ok(m.km <= cfg.longCapKm + 0.5, `${tag} lungo ${m.km}`);
        if (dist === "marathon") assert.ok(m.sec <= 3 * 3600 + 900 || m.km <= 30, `${tag} lungo ${Math.round(m.sec / 60)} min`);
      }
      for (let i = 1; i < p.weeks.length - 1; i++) if (!p.weeks[i - 1].recovery) assert.ok(p.weeks[i].km <= p.weeks[i - 1].km * 1.3, `${tag} salto w${i}`);
      if (p.weeks.length > 4) assert.ok(p.weeks.at(-2).km <= Math.max(...p.weeks.map(w => w.km)) * 0.8, `${tag} taper`);
    }
  }
  assert.ok(count > 500);
});

test("corridori simulati: gli adattamenti restano limitati, mai più km, mai dopo la gara", () => {
  const rnd = mulberry(2026), pick = a => a[Math.floor(rnd() * a.length)];
  for (let r = 0; r < 60; r++) {
    const dist = pick(["marathon", "half", "10k"]);
    const goal = { marathon: pick([10800, 14400, 18000]), half: pick([5400, 7200, 9000]), "10k": pick([2700, 3300, 3900]) }[dist];
    const behavior = pick(["good", "tired", "slow", "fast", "lazy", "chaotic"]);
    let plan = generatePlan({ distance: dist, goalTimeSec: goal, raceDate: "2027-01-31", daysAvailable: pick([3, 4, 5, 6]), weeklyKm: 30, longestRunKm: 16 }, { today: "2026-10-11" });
    const original = plan; let feedback = [], workouts = [], dismissed = [];
    for (let day = 0; day < plan.totalWeeks * 7; day++) {
      const today = addDays(plan.startDate, day), loc = locate(plan, today);
      if (loc.state !== "in" || plan.status === "paused") continue;
      const eff = effectiveSession(plan, loc.day);
      if (eff) {
        const baseKm = effectiveSession({ ...plan, adjustments: [] }, loc.day).km;
        assert.ok(eff.km <= baseKm * 1.03 + 0.05, `${behavior} ${today} ${eff.km} > ${baseKm}`);
        assert.ok(eff.km >= baseKm * 0.45 - 0.1 || eff.kind === "easy", `${behavior} ${today} ${eff.km} troppo ridotta (${baseKm})`);
        const exp = { easy: 4, quality: 7, long: 5, race: 8 }[eff.kind];
        const fb = { id: `f${day}`, date: today, planId: plan.id, kind: eff.kind, title: eff.title, plannedKm: eff.km, plannedAvgPaceSec: eff.avgPaceSec, completion: "completed", fatigue: false, pain: false, rpe: 5 };
        if (rnd() < { good: 0.03, tired: 0.1, slow: 0.05, fast: 0.03, lazy: 0.45, chaotic: 0.2 }[behavior]) { fb.completion = "skipped"; fb.rpe = null; }
        else {
          const mult = { good: 1, tired: 1.02, slow: 1.09, fast: 0.94, lazy: 1.03, chaotic: 0.9 + rnd() * 0.25 }[behavior];
          fb.rpe = Math.max(1, Math.min(10, Math.round(exp + { good: 0, tired: 2, slow: 1.5, fast: -1.5, lazy: 0, chaotic: (rnd() - 0.5) * 6 }[behavior])));
          fb.actualKm = eff.km; fb.durationSec = Math.round(eff.km * eff.avgPaceSec * mult); fb.fatigue = behavior === "tired" && rnd() < 0.25;
          workouts.push({ date: today, distanceKm: fb.actualKm, durationSec: fb.durationSec, rpe: fb.rpe });
        }
        feedback = [fb, ...feedback];
      }
      for (const prop of [...proposeFromFeedback({ plan, feedback, today, dismissed }), ...proposeFromWeek({ plan, workouts, today, dismissed })]) {
        assert.ok(!(prop.effect?.volumeFactor > 1), prop.id);
        if (rnd() < 0.7) plan = applyAdjustment(plan, prop, today); else dismissed.push(prop.id);
      }
      assert.ok(Math.abs(paceShiftFor(plan, addDays(today, 2))) <= MAX_SHIFT, `scorrimento ${behavior}`);
      if (rnd() < 0.05 && loc.day.session) { const t = moveTargets(plan, today, today); if (t.length) plan = moveSession(plan, today, pick(t).date, today).plan; }
      assert.ok(validPlan(plan));
    }
    assert.equal(proposeFromFeedback({ plan, feedback, today: addDays(plan.raceDate, 2), dismissed }).length, 0);
    assert.equal(plan.weeks.flatMap(w => w.days).filter(d => d.session).length, original.weeks.flatMap(w => w.days).filter(d => d.session).length);
    const ids = plan.adjustments.map(a => a.id); assert.equal(new Set(ids).size, ids.length);
  }
});

test("stato salvato: i piani validi sopravvivono, i dati sporchi vengono scartati", () => {
  const p = generatePlan({ goalTimeSec: 14400, raceDate: "2027-01-31", daysAvailable: 4, weeklyKm: 30, longestRunKm: 16 }, { today: "2026-10-11" });
  assert.ok(sanitize({ plan: p }).plan);
  assert.equal(sanitize({ plan: { ...p, weeks: [{ week: 1, km: 3, days: [] }] } }).plan, null);
  assert.equal(sanitize({ plan: { ...p, weeks: p.weeks.map(w => ({ ...w, days: w.days.map(d => d.session ? { ...d, session: { ...d.session, steps: [{ k: "boh" }] } } : d) })) } }).plan, null);
  assert.equal(sanitize({ plan: { id: "x" } }).plan, null);
  const s = sanitize({ workouts: [null, { date: 5 }, {}, { id: "a", date: "2026-11-01", distanceKm: 5 }, { id: "b", date: "2026-11-01", distanceKm: "5" }], feedback: [null, { date: "2026-11-01" }], dismissed: [1, "x"], savedAt: "boh" });
  assert.deepEqual([s.workouts.length, s.feedback.length, s.dismissed, s.savedAt], [1, 0, ["x"], 0]);
  assert.deepEqual(sanitize(null), { profile: null, plan: null, workouts: [], feedback: [], dismissed: [], tests: [], savedAt: 0 });
});

test("FIT: file corrotti (anche con CRC rifatto) non mandano in crash il decoder", () => {
  const rnd = mulberry(7), paces = buildPaces(341);
  const base = encodeWorkoutFit({ name: "x", steps: [run("RIS", 3), reps(6, "RipM", 0.8, "REC_M", 150), run("DEF", 1)], paces });
  const fix = b => { const c = crc16(b, 0, b.length - 2); b[b.length - 2] = c & 255; b[b.length - 1] = c >> 8; };
  for (let i = 0; i < 3000; i++) {
    const b = Uint8Array.from(base);
    for (let k = 0, n = 1 + Math.floor(rnd() * 4); k < n; k++) b[14 + Math.floor(rnd() * (b.length - 16))] = Math.floor(rnd() * 256);
    if (rnd() < 0.9) fix(b);
    try { decodeFit(b); decodeFitActivities(b); } catch (e) { assert.ok(e instanceof Error && !(e instanceof RangeError) && !(e instanceof TypeError), e.constructor.name + " " + e.message); }
  }
});
