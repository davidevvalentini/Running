import test from "node:test";
import assert from "node:assert/strict";
import { buildSessionPrescription } from "../src/domain/prescriptions.js";

test("builds a structured warm-up, main block and cool-down", () => {
  const prescription = buildSessionPrescription({
    type: "threshold", distanceKm: 8, effort: "controlled",
    structure: { warmupKm: 1.5, mainKm: 5, cooldownKm: 1.5, mainSet: "5 × 1 km a soglia con recuperi facili." }
  });
  assert.deepEqual(prescription.steps.map(step => step.kind), ["warmup", "main", "cooldown"]);
  assert.equal(prescription.totalKm, 8);
  assert.equal(prescription.steps.reduce((sum, step) => sum + step.distanceKm, 0), 8);
  assert.match(prescription.steps[1].instruction, /recupero in corsa facile/i);
  assert.equal(prescription.steps[1].effort, "RPE 6/10");
});

test("preserves simple easy session distance and effort cues", () => {
  const prescription = buildSessionPrescription({
    type: "easy", distanceKm: 5,
    structure: { warmupKm: 0.5, mainKm: 4, cooldownKm: 0.5, mainSet: "Corsa facile conversazionale." }
  });
  assert.equal(prescription.totalKm, 5);
  assert.equal(prescription.steps.length, 3);
  assert.ok(prescription.note.includes("Non recuperare"));
});

test("rejects malformed prescriptions and omits zero-distance steps", () => {
  assert.throws(() => buildSessionPrescription(null), /distanceKm/);
  const prescription = buildSessionPrescription({
    type: "long", distanceKm: 7,
    structure: { warmupKm: 0, mainKm: 7, cooldownKm: 0, mainSet: "Tutto facile." }
  });
  assert.equal(prescription.steps.length, 1);
  assert.equal(prescription.steps[0].kind, "main");
});
