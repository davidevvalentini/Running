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

test("shows exact repetition and recovery distances when structured set details exist", () => {
  const intervals = buildSessionPrescription({
    type: "intervals", distanceKm: 6, effort: "controlled",
    structure: {
      warmupKm: 1, mainKm: 4, cooldownKm: 1,
      mainSet: "Parte centrale: 5 × 400 m controllati, con 200 m facili.",
      setDetails: { kind: "intervals", repetitions: 5, workDistanceKm: 0.4, recoveryDistanceKm: 0.2, recoveryCount: 4 }
    }
  });
  assert.match(intervals.steps.find(step => step.kind === "work").title, /Ripetuta 1\/5 · 400 m/);
  assert.equal(intervals.steps.filter(step => step.kind === "recovery").length, 4);
  const threshold = buildSessionPrescription({
    type: "threshold", distanceKm: 8, effort: "controlled",
    structure: {
      warmupKm: 1.5, mainKm: 5, cooldownKm: 1.5,
      mainSet: "Parte centrale: 3 × 1 km a soglia, con 400 m facili tra i blocchi.",
      setDetails: { kind: "threshold", repetitions: 3, workDistanceKm: 1, recoveryDistanceKm: 0.4, recoveryCount: 2 }
    }
  });
  assert.match(threshold.steps.find(step => step.kind === "work").title, /Ripetuta 1\/3 · 1000 m/);
  assert.equal(threshold.steps.filter(step => step.kind === "recovery").length, 2);
});


test("expands structured quality sets into individual work and recovery steps", () => {
  const prescription = buildSessionPrescription({
    type: "intervals", distanceKm: 6, effort: "controlled",
    structure: {
      warmupKm: 1, mainKm: 4, cooldownKm: 1,
      mainSet: "5 × 400 m controllati, con 200 m facili.",
      setDetails: {
        kind: "intervals", repetitions: 5, workDistanceKm: 0.4,
        recoveryDistanceKm: 0.2, recoveryCount: 4,
        recoveryIntensity: "corsa molto facile", workIntensityRpe: 7
      }
    }
  });
  assert.equal(prescription.totalKm, 6);
  assert.equal(prescription.steps.filter(step => step.kind === "work").length, 5);
  assert.equal(prescription.steps.filter(step => step.kind === "recovery").length, 4);
  assert.equal(prescription.steps.find(step => step.kind === "easy").distanceKm, 1.2);
  assert.deepEqual(prescription.steps.map(step => step.order), prescription.steps.map((_, index) => index + 1));
  assert.equal(Math.round(prescription.steps.reduce((sum, step) => sum + step.distanceKm, 0) * 10) / 10, 6);
});

test("threshold expansion puts recovery only between repetitions and preserves total distance", () => {
  const prescription = buildSessionPrescription({
    type: "threshold", distanceKm: 8,
    structure: {
      warmupKm: 1.5, mainKm: 5, cooldownKm: 1.5,
      mainSet: "3 × 1 km a soglia, recupero 400 m.",
      setDetails: {
        kind: "threshold", repetitions: 3, workDistanceKm: 1,
        recoveryDistanceKm: 0.4, recoveryCount: 2, recoveryIntensity: "corsa facile"
      }
    }
  });
  assert.equal(prescription.steps.filter(step => step.kind === "work").length, 3);
  assert.equal(prescription.steps.filter(step => step.kind === "recovery").length, 2);
  assert.equal(prescription.steps.filter(step => step.kind === "easy").length, 1);
  assert.equal(prescription.totalKm, 8);
  assert.equal(prescription.steps.at(-1).kind, "cooldown");
});
