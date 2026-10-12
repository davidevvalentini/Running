// Mezza maratona a 8 settimane, allineata al programma di un professionista.
import test from "node:test";
import assert from "node:assert/strict";
import { generatePlan, planSummary } from "../src/domain/plan.js";
import { measure, expandSteps } from "../src/domain/session.js";
import { buildPaces } from "../src/domain/paces.js";
import { validPlan } from "../src/storage/local-store.js";

const base = { distance: "half", goalTimeSec: 6300, raceDate: "2024-02-11", daysAvailable: 3 };   // 1h45', RG 4'59"
const TODAY = "2023-12-18";
const plan = generatePlan(base, { today: TODAY });
const P = planSummary(plan).paces;
const sessions = (w) => plan.weeks[w - 1].days.map(d => d.session);
const kmOf = s => measure(s.steps, P).km;

test("8 settimane, metodo mezza8, gara la domenica dell'ultima settimana", () => {
  assert.equal(plan.method, "mezza8"); assert.equal(plan.totalWeeks, 8);
  assert.equal(plan.weeks[0].days[0].date, "2023-12-18");
  assert.equal(plan.weeks.at(-1).days[6].session.kind, "race");
  assert.equal(validPlan(plan), true);
});

test("ritmi: FL = RG+35″, FM = RG+20″", () => {
  const p = buildPaces(300, 0, "half");
  assert.equal(p.FL, 335); assert.equal(p.FM, 320); assert.equal(p.GARA, 300);
  assert.equal(buildPaces(340, 0, "marathon").FL, 350);
});

test("3 giorni: lunedì, giovedì, sabato; settimana di gara solo giovedì + gara", () => {
  for (const w of plan.weeks.slice(0, 7)) assert.deepEqual(w.days.map(d => Boolean(d.session)), [true, false, false, true, false, true, false]);
  assert.deepEqual(plan.weeks[7].days.map(d => Boolean(d.session)), [false, false, false, true, false, false, true]);
});

test("sedute chiave del programma", () => {
  assert.match(sessions(1)[0].title, /Test 1: 5000 m/);
  assert.match(sessions(1)[5].title, /5 × 2000 m a RG−20″/);
  assert.match(sessions(3)[5].title, /Test 3: mezza/);
  assert.match(sessions(5)[3].title, /Test 4: 15 km a RG/);
  assert.equal(Math.round(kmOf(sessions(4)[5])), 25);         // fondo lento 25 km
  assert.equal(Math.round(kmOf(sessions(2)[5])), 22);
  assert.match(sessions(6)[0].title, /3 × 5000 m a RG\+5″/);
  assert.match(sessions(8)[3].title, /4 × 400 m a RG−20″/);
});

test("volume: picco in settimana 4 oltre i 50 km, taper alla fine", () => {
  const km = plan.weeks.map(w => w.km);
  assert.ok(Math.max(...km) >= 50 && km.indexOf(Math.max(...km)) === 3, km.join(","));
  assert.ok(km[7] < km[5] && km[6] < km[5]);
});

test("più di 3 giorni: fondi lenti extra facoltativi, le sedute principali non cambiano", () => {
  const p5 = generatePlan({ ...base, daysAvailable: 5 }, { today: TODAY });
  assert.equal(p5.weeks[0].days.filter(d => d.session).length, 5);
  assert.ok(p5.warnings.some(w => /fondi lenti facoltativi/.test(w)));
  assert.equal(p5.weeks[0].days[0].session.title, plan.weeks[0].days[0].session.title);
});

test("meno di 8 settimane: parte dalle ultime e avvisa", () => {
  const p = generatePlan(base, { today: "2024-01-08" });
  assert.equal(p.totalWeeks, 5); assert.ok(p.warnings.some(w => /Mancano settimane/.test(w)));
});

test("ripetute con recupero da fermo e recuperi corsi si espandono in km coerenti", () => {
  const s = sessions(6)[0];
  const exp = expandSteps(s.steps, P);
  assert.ok(exp.length > 0);
  assert.ok(Math.abs(kmOf(s) - (2.5 + 15 + 3 * 1.5)) < 0.6, String(kmOf(s)));
});
