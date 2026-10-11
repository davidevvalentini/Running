import test from "node:test";
import assert from "node:assert/strict";
import { generatePlan, planSummary, DISTANCES, requiredAbilities, validateProfile } from "../src/domain/plan.js";
import { measure } from "../src/domain/session.js";
import { effectiveSession, moveSession, moveTargets } from "../src/domain/adapt.js";
import { hrZones, weeklyLoad, weatherAdvice, fetchWeather } from "../src/domain/extras.js";

const base = { raceDate: "2027-01-31", daysAvailable: 4, weeklyKm: 30, longestRunKm: 16 };
const plan = generatePlan({ ...base, goalTimeSec: 4 * 3600 }, { today: "2026-10-11" });

test("mezza maratona: 12 settimane, gara 21,1 km, ritmo gara = ritmo obiettivo", () => {
  const p = generatePlan({ ...base, distance: "half", goalTimeSec: 2 * 3600 }, { today: "2026-10-11", });
  assert.equal(p.totalWeeks, 12); assert.equal(p.distanceLabel, "Mezza maratona");
  const race = p.weeks.at(-1).days[6].session;
  assert.equal(race.kind, "race"); assert.equal(race.title, "Mezza maratona");
  const s = planSummary(p);
  assert.equal(s.paces.GARA, Math.round(7200 / 21.0975));
  assert.ok(s.paces["Z2-CLR"] > s.paces.GARA + 30);        // lento davvero più lento del passo gara
  assert.ok(p.weeks.every(w => w.km > 0));
  assert.ok(Math.max(...p.weeks.map(w => w.km)) < 55);
});

test("10 km: 10 settimane, lunghi contenuti", () => {
  const p = generatePlan({ ...base, distance: "10k", goalTimeSec: 3300 }, { today: "2026-10-11" });
  assert.equal(p.totalWeeks, 10);
  const paces = planSummary(p).paces;
  for (const w of p.weeks.slice(0, -1)) assert.ok(measure(w.days[6].session.steps, paces).km <= 16.5);
  assert.equal(p.weeks.at(-1).days[6].session.steps[0].km, 10);
});

test("limiti di obiettivo per distanza", () => {
  assert.equal(validateProfile({ ...base, distance: "half", goalTimeSec: 4 * 3600 }).ok, false);
  assert.equal(validateProfile({ ...base, distance: "10k", goalTimeSec: 3300 }).ok, true);
  assert.equal(validateProfile({ ...base, distance: "ultra", goalTimeSec: 3300 }).ok, false);
  assert.equal(validateProfile({ ...base, goalTimeSec: 4 * 3600, maxHr: 300 }).ok, false);
});

test("capacità richieste per mezza", () => {
  assert.ok(requiredAbilities(2 * 3600, 21.0975).t10 < 2 * 3600 * 0.5);
  assert.ok(Object.keys(DISTANCES).length === 3);
});

test("sposta seduta: scambio nella stessa settimana", () => {
  const w = plan.weeks[3], quality = w.days[2], rest = w.days[3];
  const { plan: moved, warning } = moveSession(plan, quality.date, rest.date, "2026-10-12");
  assert.equal(moved.weeks[3].days[3].session.kind, "quality");
  assert.equal(moved.weeks[3].days[2].session, null);
  assert.equal(moved.version, 2);
  assert.equal(effectiveSession(moved, moved.weeks[3].days[3]).kind, "quality");
  assert.equal(warning, null);
  // qualità accanto al lungo (sabato)
  const r = moveSession(plan, quality.date, w.days[5].date, "2026-10-12");
  assert.ok(r.warning);
});

test("sposta seduta: rifiuti", () => {
  const w = plan.weeks[3];
  assert.throws(() => moveSession(plan, w.days[2].date, plan.weeks[4].days[2].date, "2026-10-12"), /stessa settimana|dentro/);
  assert.throws(() => moveSession(plan, w.days[0].date, w.days[2].date, "2026-10-12"), /non c'è/);
  assert.throws(() => moveSession(plan, w.days[2].date, w.days[3].date, "2026-12-01"), /passato/);
  const last = plan.weeks.at(-1);
  assert.throws(() => moveSession(plan, last.days[6].date, last.days[5].date, "2026-10-12"), /gara/);
  assert.equal(moveTargets(plan, last.days[6].date, "2026-10-12").length, 0);
  assert.ok(moveTargets(plan, w.days[2].date, "2026-10-12").length >= 5);
});

test("zone cardiache", () => {
  const z = hrZones(190);
  assert.deepEqual([z[0].low, z[0].high, z[3].high], [139, 152, 190]);
  assert.equal(hrZones(null), null);
});

test("carico settimanale (minuti × RPE)", () => {
  const w = [{ date: "2026-11-02", durationSec: 3600, rpe: 5 }, { date: "2026-11-04", durationSec: 1800, rpe: 8 }, { date: "2026-11-05", distanceKm: 5 }, { date: "2026-12-01", durationSec: 600, rpe: 5 }];
  assert.deepEqual(weeklyLoad(w, "2026-11-02", "2026-11-08"), { load: 540, counted: 2, total: 3 });
});

test("consigli meteo", () => {
  assert.equal(weatherAdvice({ tempMax: 12, tempMin: 5, rainProb: 0, windMax: 10 }).slowdown, 0);
  const hot = weatherAdvice({ tempMax: 28, tempMin: 20, rainProb: 70, windMax: 40 });
  assert.equal(hot.slowdown, 15); assert.ok(hot.notes.length >= 3);
  assert.ok(weatherAdvice({ tempMax: 3, tempMin: -2, rainProb: 0, windMax: 0 }).notes[0].includes("ghiaccio"));
});

test("fetchWeather con fetch simulato", async () => {
  const fake = async url => ({ json: async () => url.includes("geocoding") ? { results: [{ name: "Milano", latitude: 45, longitude: 9 }] } : { daily: { time: ["2026-11-18"], temperature_2m_max: [14], temperature_2m_min: [6], precipitation_probability_max: [20], wind_speed_10m_max: [12] } } });
  const w = await fetchWeather("Milano", fake);
  assert.equal(w.place, "Milano"); assert.equal(w.days[0].tempMax, 14);
  await assert.rejects(fetchWeather("xx", async () => ({ json: async () => ({}) })), /non trovata/);
});
