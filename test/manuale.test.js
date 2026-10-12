// Regole del piano maratona tratte da "Il manuale completo della maratona" (R. Albanesi).
import test from "node:test";
import assert from "node:assert/strict";
import { generatePlan, planSummary, addDays, wdShort } from "../src/domain/plan.js";
import { MANUALE_WEEKS, MANUALE_8_WEEKS, DAYS_PENALTY_SEC } from "../src/domain/manuale.js";
import { buildPaces, manualCode } from "../src/domain/paces.js";
import { measure, notation, expandSteps } from "../src/domain/session.js";
import { effectiveSession, applyAdjustment } from "../src/domain/adapt.js";
import { validPlan } from "../src/storage/local-store.js";
import { encodeWorkoutFit, decodeFit } from "../src/import/fit.js";

const base = { goalTimeSec: 12600, raceDate: "2027-03-07", daysAvailable: 6 };   // 3h30', RG 4'58"/km
const TODAY = "2026-10-12";                                                     // 21 settimane prima
const gen = (over = {}, today = TODAY) => generatePlan({ ...base, ...over }, { today });
const plan = gen();
const s = planSummary(plan);
const P = s.paces;
const stepsOf = (w, d) => plan.weeks[w - 1].days[d].session.steps;
const kmOf = (w, d) => measure(stepsOf(w, d), P).km;

test("ritmi del manuale: scarti esatti dal ritmo gara, al secondo", () => {
  const p = buildPaces(300);
  assert.equal(p.FL, 310); assert.equal(p.FM, 290);
  assert.equal(p[manualCode(7)], 307); assert.equal(p[manualCode(-20)], 280); assert.equal(p[manualCode(0)], 300);
  assert.equal(p["RG+15"], 315); assert.equal(p["RG+30"], 330); assert.equal(p["RG-40"], 260);
});

test("maratona: di default il piano del manuale, 12 settimane; la mezza usa il suo programma, la 10 km resta invariata", () => {
  assert.equal(plan.method, "manuale"); assert.equal(plan.totalWeeks, 12); assert.equal(plan.startDate, addDays(base.raceDate, -83));
  assert.equal(generatePlan({ ...base, distance: "half", goalTimeSec: 6300 }, { today: TODAY }).method, "mezza8");
  assert.equal(generatePlan({ ...base, distance: "10k", goalTimeSec: 3000 }, { today: TODAY }).method, "goandrace");
  assert.equal(generatePlan({ ...base, method: "goandrace" }, { today: TODAY }).totalWeeks, 16);
  assert.equal(validPlan(plan), true);
});

test("settimana tipo: S6 riposo, S7 lunghissimo (domenica), gara nell'ultimo giorno", () => {
  for (const w of plan.weeks.slice(0, -1)) {
    assert.equal(w.days[5].session, null, `S6 w${w.week}`);
    assert.equal(w.days[6].session.kind, "long", `S7 w${w.week}`);
    assert.equal(w.days.filter(d => d.session).length, 6);
  }
  const last = plan.weeks.at(-1);
  assert.equal(last.days[6].session.kind, "race"); assert.equal(last.days[6].date, base.raceDate);
  assert.equal(last.days[4].session, null); assert.equal(last.days[5].session, null);
});

test("giorni a settimana: con 5 si salta S5, con 4 S1 e S5, con 3 S1, S2 e S5", () => {
  const expected = { 5: [4], 4: [0, 4], 3: [0, 1, 4] };
  for (const [days, drop] of Object.entries(expected)) {
    const p = gen({ daysAvailable: Number(days) });
    for (const w of p.weeks.slice(0, -1)) {
      assert.equal(w.days.filter(d => d.session).length, Number(days), `${days} giorni w${w.week}`);
      for (const i of drop) assert.equal(w.days[i].session, null);
    }
    assert.ok(p.warnings.some(x => x.includes(`${DAYS_PENALTY_SEC[days]}″/km`)), "penalità ritmo");
  }
});

test("fondo lento a RG+10″, fondo medio a RG−10″ (secondi/km)", () => {
  assert.equal(P.FL, P.GARA + 10); assert.equal(P.FM, P.GARA - 10);
  const fl = stepsOf(1, 0).at(-1);
  assert.equal(fl.code, "FL"); assert.equal(fl.km, 15);
});

test("lunghissimi: 32 km a RG+15″, Tergat 30+2, 35+1, mai oltre 36 km a ritmo costante", () => {
  const long = w => plan.weeks[w - 1].days[6].session;
  assert.deepEqual(long(4).steps.map(x => [x.code, x.km]), [["RG+15", 32]]);
  assert.deepEqual(long(7).steps.map(x => [x.code, x.km]), [["RG+7", 30], ["RG-20", 2]]);
  assert.deepEqual(long(9).steps.map(x => [x.code, x.km]), [["RG+7", 35], ["RG-20", 1]]);
  assert.equal(P["RG+7"], P.GARA + 7);
  const lengths = [4, 7, 9].map(w => kmOf(w, 6));
  assert.deepEqual(lengths, [32, 32, 36]);
  // il lunghissimo da 36 km cade 3 settimane prima della gara (~18 giorni, fra 15 e 21)
  const days = (Date.parse(base.raceDate) - Date.parse(plan.weeks[8].days[6].date)) / 86400000;
  assert.ok(days >= 15 && days <= 21, `giorni ${days}`);
});

test("progressivo: parte dal lento e arriva al massimo a RG", () => {
  const fp = stepsOf(3, 2);                                     // FP 12 km: 2/4 lento, 1/4 RG, 1/4 medio
  assert.deepEqual(fp.map(x => x.code), ["FL", "RG+0", "FM"]);
  const longFp = stepsOf(2, 6);                                 // FP 24 km: mai sotto RG
  assert.equal(measure(longFp, P).km, 24);
  assert.ok(longFp.every(x => P[x.code] >= P.GARA));
});

test("niente ripetute brevi né intermittenti: ogni ripetuta di qualità è ≥ 500 m", () => {
  for (const w of plan.weeks) for (const d of w.days) {
    if (d.session?.kind !== "quality") continue;
    for (const st of d.session.steps) if (st.k === "reps") assert.ok(st.workKm >= 0.5, `${d.session.title} ${st.workKm}`);
  }
});

test("al più 2 sedute di qualità a settimana; settimana 11-12 senza verifiche sotto RG", () => {
  for (const w of plan.weeks) assert.ok(w.days.filter(d => d.session?.kind === "quality").length <= 2, `w${w.week}`);
  for (const w of plan.weeks.slice(10)) for (const d of w.days) for (const st of d.session?.steps ?? []) {
    if (st.k === "reps") assert.ok(P[st.workCode] >= P.GARA - 10, `w${w.week} ${st.workCode}`);
  }
});

test("scarico e tapering: settimane 5, 8 e 11 di scarico, ultima settimana (gara esclusa) sotto il 60% del picco", () => {
  assert.deepEqual(plan.weeks.filter(w => w.recovery).map(w => w.week), [5, 8, 11]);
  const peak = Math.max(...plan.weeks.map(w => w.km));
  assert.ok(plan.weeks[10].km < plan.weeks[9].km);
  assert.ok(plan.weeks[11].km - 42.195 < peak * 0.6, `${plan.weeks[11].km} vs ${peak}`);   // senza la gara
});

test("ultimo stimolo qualitativo: 5×2000 m a RG−10″ con 2' da fermo", () => {
  const q = plan.weeks[11].days[1].session;
  const r = q.steps.find(x => x.k === "reps");
  assert.deepEqual([r.n, r.workKm, r.workCode, r.recSec, r.recCode], [5, 2, "RG-10", 120, "FERMO"]);
  assert.match(notation(q.steps), /5 x \(2 km RG-10 \+ 2'00" FERMO\)/);
});

test("recupero da fermo: nessun km, nessun ritmo", () => {
  const steps = stepsOf(3, 1);                                  // 5000 m + 4' fermo + 8×500 m + 1'30" fermo
  const m = measure(steps, P);
  assert.equal(m.km, 2.5 + 5 + 4);
  const rows = expandSteps(steps, P).filter(r => r.title === "Recupero");
  assert.ok(rows.length === 9 && rows.every(r => r.km === 0 && r.detail.includes("da fermo")));
});

test("versione a 8 settimane (saltando 1, 2, 5, 6) e settimane insufficienti", () => {
  const p8 = gen({}, addDays(base.raceDate, -9 * 7));
  assert.equal(p8.totalWeeks, 8); assert.deepEqual(p8.weeks.map(w => w.name), MANUALE_8_WEEKS.map(w => w.name));
  assert.ok(p8.warnings.some(x => x.includes("8")));
  const p6 = gen({}, addDays(base.raceDate, -6 * 7));
  assert.equal(p6.totalWeeks, 6); assert.ok(p6.warnings.some(x => x.includes("8 settimane")));
  assert.equal(p6.weeks.at(-1).days[6].session.kind, "race");
  assert.equal(MANUALE_WEEKS.length, 12);
});

test("obiettivo: avviso se più veloce di 2,15 × mezza (manuale: maratona ≈ 2,2 × mezza)", () => {
  const half = 5400;                                            // 1h30' → ~3h18'
  const p = gen({ goalTimeSec: 3 * 3600, recentRaceDistanceKm: 21.0975, recentRaceTimeSec: half });
  assert.ok(p.warnings.some(x => x.includes("2,15")));
  assert.equal(gen({ goalTimeSec: 3 * 3600 + 1100, recentRaceDistanceKm: 21.0975, recentRaceTimeSec: half }).warnings.some(x => x.includes("2,15")), false);
});

test("adattamenti: qualità sostituita da fondo lento, riduzione senza prolungare sedute da fermo", () => {
  const q = plan.weeks[2].days[1];                              // seduta di qualità
  const adj = applyAdjustment(plan, { id: "x", title: "t", reason: "r", effect: { fromDate: q.date, toDate: q.date, volumeFactor: 0.85, qualityToEasy: true } });
  const eff = effectiveSession(adj, q);
  assert.equal(eff.kind, "easy"); assert.equal(eff.steps[0].code, "FL");
  const red = applyAdjustment(plan, { id: "y", title: "t", reason: "r", effect: { fromDate: q.date, toDate: q.date, volumeFactor: 0.85 } });
  assert.equal(effectiveSession(red, q).steps.find(x => x.k === "reps" && x.n === 1)?.n ?? 1, 1);
});

test("export FIT di una seduta con recuperi da fermo", () => {
  const fit = encodeWorkoutFit({ name: "5000 + 8x500", steps: stepsOf(3, 1), paces: P, now: Date.UTC(2026, 10, 18) });
  assert.equal(String.fromCharCode(...fit.slice(8, 12)), ".FIT");
  assert.ok(decodeFit(fit).length > 4);
});

test("simulazione: piani validi per obiettivo × giorni × anticipo × giorno di gara", () => {
  let count = 0;
  const wdIndex = iso => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
  for (const goal of [9900, 10800, 12600, 14400, 18000, 21600]) for (const days of [3, 4, 5, 6]) for (const ahead of [29, 60, 80, 120, 200]) for (const raceWd of [1, 5, 6]) {
    let race = addDays(TODAY, ahead); while (wdIndex(race) !== raceWd) race = addDays(race, 1);
    const p = generatePlan({ goalTimeSec: goal, raceDate: race, daysAvailable: days }, { today: TODAY });
    const tag = `${goal} d${days} +${ahead} wd${raceWd}`; count++;
    const paces = planSummary(p).paces;
    assert.equal(p.method, "manuale", tag); assert.ok(validPlan(p), tag); assert.ok(p.startDate >= TODAY, tag);
    assert.equal(p.weeks.at(-1).days[6].date, race, tag);
    p.weeks.forEach((w, wi) => {
      w.days.forEach((d, di) => {
        assert.equal(d.date, addDays(p.startDate, wi * 7 + di), tag); assert.equal(wdShort(d.date), ["LU", "MA", "ME", "GI", "VE", "SA", "DO"][wdIndex(d.date)], tag);
        if (!d.session) return;
        const m = measure(d.session.steps, paces);
        assert.ok(m.km > 0 && Number.isFinite(m.sec), tag);
        assert.ok(m.avgPaceSec > p.goalPaceSec * 0.7 && m.avgPaceSec < p.goalPaceSec * 1.6, `${tag} avg ${m.avgPaceSec}`);
        assert.equal(d.session.kind === "race", wi === p.weeks.length - 1 && di === 6, tag);
      });
      if (wi < p.weeks.length - 1) assert.equal(w.days.filter(d => d.session).length, days, tag);
    });
  }
  assert.ok(count >= 300);
});
