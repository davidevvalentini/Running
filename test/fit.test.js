import test from "node:test";
import assert from "node:assert/strict";
import { encodeWorkoutFit, decodeFit, decodeFitActivities, crc16, workoutSteps, previewFit } from "../src/import/fit.js";
import { buildPaces } from "../src/domain/paces.js";
import { reps, run } from "../src/domain/session.js";

const paces = buildPaces(4 * 3600 / 42.195);
const steps = [run("RIS", 3), reps(6, "RipM", 0.8, "REC_M", 150), run("DEF", 1)];

test("workout FIT: intestazione, CRC e messaggi", () => {
  const fit = encodeWorkoutFit({ name: "Ripetute 6x800", steps, paces, now: Date.UTC(2026, 10, 18) });
  assert.equal(String.fromCharCode(...fit.slice(8, 12)), ".FIT");
  assert.equal(fit[0], 14);
  assert.equal(crc16(fit, 0, fit.length - 2), fit[fit.length - 2] | fit[fit.length - 1] << 8);
  const msgs = decodeFit(fit);
  assert.deepEqual(msgs.map(m => m.num), [0, 26, 27, 27, 27, 27, 27]);
  assert.equal(msgs[0].fields[0], 5);          // file_id: workout
  assert.equal(msgs[1].fields[6], 5);          // numero di step
});

test("passi: ripetute -> lavoro + recupero + ripeti", () => {
  const s = workoutSteps(steps, paces);
  assert.equal(s.length, 5);
  assert.equal(s[0].durationValue, 300000);    // 3 km in cm
  assert.equal(s[1].durationValue, 80000);
  assert.equal(s[2].durationType, 0); assert.equal(s[2].durationValue, 150000);
  assert.equal(s[3].durationType, 6); assert.equal(s[3].durationValue, 1); assert.equal(s[3].targetValue, 6);
  assert.ok(s[1].low < s[1].high);
});

test("FIT danneggiato o non valido viene rifiutato", () => {
  const fit = encodeWorkoutFit({ name: "x", steps, paces });
  const bad = fit.slice(); bad[20] ^= 0xFF;
  assert.throws(() => decodeFit(bad), /CRC/);
  assert.throws(() => decodeFit(new Uint8Array(20)), /FIT valido/);
  assert.throws(() => decodeFit(fit.slice(0, fit.length - 10)), /troncato|CRC/);
});

test("import attività: session -> corsa", () => {
  // costruisce a mano: definizione session con campi 2(u32),5(enum),8(u32),9(u32)
  const body = [];
  const u16 = v => body.push(v & 255, v >> 8), u32 = v => body.push(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255);
  body.push(0x40, 0, 0); u16(18); body.push(4, 2, 4, 0x86, 5, 1, 0x00, 8, 4, 0x86, 9, 4, 0x86);
  const startFit = Math.floor((Date.UTC(2026, 10, 18, 7) - Date.UTC(1989, 11, 31)) / 1000);
  body.push(0); u32(startFit); body.push(1); u32(3_600_000); u32(1_050_000);
  const header = [14, 0x20, 0x54, 0x08, body.length & 255, body.length >> 8, 0, 0, 0x2E, 0x46, 0x49, 0x54, 0, 0];
  const c = crc16(header, 0, 12); header[12] = c & 255; header[13] = c >> 8;
  const all = [...header, ...body]; const crc = crc16(all); all.push(crc & 255, crc >> 8);
  const acts = decodeFitActivities(new Uint8Array(all));
  assert.equal(acts.length, 1);
  assert.deepEqual([acts[0].date, acts[0].distanceKm, acts[0].durationSec, acts[0].source], ["2026-11-18", 10.5, 3600, "fit"]);
  assert.equal(previewFit({ buffer: new Uint8Array(all) }).count, 1);
});

test("workout FIT non è un'attività", () => {
  assert.throws(() => previewFit({ buffer: encodeWorkoutFit({ name: "x", steps, paces }) }), /Nessuna corsa/);
});
