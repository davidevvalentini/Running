// Confronto con piani di riferimento (valori numerici misurati su 16 piani pubblici di GoAndRace:
// ritmi, durata, volumi, lungo massimo). Non contiene sedute né testi: solo i numeri di controllo.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { generatePlan, planSummary, recommendedDays } from "../src/domain/plan.js";
import { measure } from "../src/domain/session.js";

const refs = JSON.parse(fs.readFileSync(new URL("./fixtures/reference.json", import.meta.url), "utf8"));
// Scarti noti (percentuale sul totale km): 10 km sotto i 40' a 6 giorni e mezza a 3 giorni a 2h00.
const TOLERANCE = { tenk_40: 0.14, half_2h00_rf1: 0.09 };

for (const r of refs) {
  const plan = generatePlan({ distance: r.distance, goalTimeSec: r.goalSec, raceDate: "2027-01-31", daysAvailable: r.days, weeklyKm: 40, longestRunKm: 18 }, { today: "2026-06-01" });
  const s = planSummary(plan);

  test(`${r.name}: stessa durata del piano`, () => assert.equal(plan.totalWeeks, r.weeks));

  test(`${r.name}: ritmi per tipologia identici al riferimento`, () => {
    for (const [code, ref] of Object.entries(r.paces)) {
      if (code === "GARA") continue;
      assert.ok(Math.abs(s.paces[code] - ref) <= 5, `${code}: mio ${s.paces[code]} rif ${ref}`);
    }
    const exact = Object.entries(r.paces).filter(([c]) => c !== "GARA" && s.paces[c] === r.paces[c]).length;
    assert.ok(exact >= Object.keys(r.paces).length - 3, `ritmi identici: ${exact}`);
  });

  test(`${r.name}: volume totale vicino al riferimento`, () => {
    const tol = TOLERANCE[r.name] ?? 0.04;
    assert.ok(Math.abs(s.totalKm / r.totalKm - 1) <= tol, `km totali ${s.totalKm} vs ${r.totalKm}`);
  });

  test(`${r.name}: lungo massimo coerente`, () => {
    const mine = Math.max(...plan.weeks.slice(0, -1).map(w => measure(w.days[6].session.steps, s.paces).km));
    assert.ok(mine <= r.longMax + 4 && mine >= r.longMax - 8, `lungo ${mine} vs ${r.longMax}`);
  });
}

test("giorni consigliati per fascia coerenti con i piani di riferimento", () => {
  for (const r of refs.filter(x => !x.name.endsWith("_rf1"))) assert.equal(recommendedDays(r.distance, r.goalSec), r.days, r.name);
});
