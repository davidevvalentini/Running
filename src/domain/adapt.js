import { buildPaces } from "./paces.js";
import { easyReplacement, measure, scaleSession } from "./session.js";
import { addDays } from "./plan.js";

const round1 = n => Math.round(n * 10) / 10;
const DAY = 86400000;
const diffDays = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY);

// RPE attesa per tipo di seduta (indicativa, per leggere il feedback).
export const EXPECTED_RPE = { easy: 4, quality: 7, long: 5, race: 8, extra: 4 };

const inRange = (adj, date) => date >= adj.fromDate && (adj.toDate == null || date <= adj.toDate);

export function paceShiftFor(plan, date) {
  return (plan.adjustments ?? []).filter(a => a.paceShiftSec && inRange(a, date)).reduce((s, a) => s + a.paceShiftSec, 0);
}
export function pacesFor(plan, date) {
  return buildPaces(plan.racePaceSec, paceShiftFor(plan, date));
}

// Seduta del giorno dopo gli aggiustamenti accettati.
export function effectiveSession(plan, day) {
  const session = day.session;
  if (!session) return null;
  const paces = pacesFor(plan, day.date);
  let result = session;
  for (const adj of (plan.adjustments ?? []).filter(a => inRange(a, day.date))) {
    if (adj.qualityToEasy && result.kind === "quality") result = easyReplacement(result, paces);
    if (adj.volumeFactor && adj.volumeFactor < 1) result = scaleSession(result, adj.volumeFactor);
  }
  return { ...result, paces, ...measure(result.steps, paces) };
}

// Posizione di una data nel piano.
export function locate(plan, date) {
  if (!plan?.weeks?.length) return null;
  const offset = diffDays(date, plan.startDate);
  if (offset < 0) return { state: "before", daysToStart: -offset };
  const wi = Math.floor(offset / 7);
  if (wi >= plan.weeks.length) return { state: "after" };
  const week = plan.weeks[wi], day = week.days[offset % 7];
  return { state: "in", week, weekIndex: wi, dayIndex: offset % 7, day };
}

export function nextSession(plan, date) {
  for (let i = 1; i <= 14; i++) {
    const loc = locate(plan, addDays(date, i));
    if (loc?.state === "in" && loc.day.session) return { ...loc, inDays: i };
  }
  return null;
}

export function applyAdjustment(plan, proposal) {
  const adj = { id: proposal.id, createdAt: new Date().toISOString(), title: proposal.title, reason: proposal.reason, ...proposal.effect };
  return { ...plan, adjustments: [...(plan.adjustments ?? []), adj], version: (plan.version ?? 1) + 1 };
}

function avgPace(entry) {
  return entry.actualKm && entry.durationSec ? entry.durationSec / entry.actualKm : null;
}

// Interpreta il feedback recente e produce al più una proposta (mai automatica,
// salvo la sospensione per dolore). Mai km recuperati.
export function proposeFromFeedback({ plan, feedback, today, dismissed = [] }) {
  const recent = (feedback ?? []).filter(f => f.date >= addDays(today, -14) && f.planId === plan.id);
  const latest = recent[0];
  const from = addDays(today, 1), to = addDays(today, 7);
  const make = (kind, title, reason, effect) => ({ id: `${kind}:${latest?.date ?? today}`, kind, title, reason, effect });
  const out = [];
  if (!latest) return out;
  if (latest.pain) {
    out.push({ id: `pause:${latest.date}`, kind: "pause", title: "Sospendi il piano", reason: "Hai segnalato dolore o sintomi preoccupanti: non proseguire con la progressione e chiedi una valutazione professionale.", effect: null });
    return out;
  }
  const expected = EXPECTED_RPE[latest.kind] ?? 5;
  if (latest.fatigue || (latest.rpe != null && latest.rpe >= expected + 3)) {
    out.push(make("reduce", "Alleggerisci i prossimi 7 giorni",
      `${latest.fatigue ? "Hai segnalato fatica insolita" : `RPE ${latest.rpe} su una seduta prevista a ~${expected}`}: riduco i volumi del 15% e sostituisco la qualità con corsa lenta, senza recuperare nulla.`,
      { fromDate: from, toDate: to, volumeFactor: 0.85, qualityToEasy: true }));
  }
  if (!out.length) {
    const checked = recent.filter(f => f.completion !== "skipped" && f.kind !== "easy" && f.plannedAvgPaceSec && avgPace(f)).slice(0, 2);
    if (checked.length === 2) {
      const gaps = checked.map(f => avgPace(f) / f.plannedAvgPaceSec);
      const rpes = checked.map(f => f.rpe).filter(r => r != null);
      const high = rpes.length === 2 && checked.every((f, i) => f.rpe >= (EXPECTED_RPE[f.kind] ?? 5) + 1);
      const low = rpes.length === 2 && checked.every((f, i) => f.rpe <= (EXPECTED_RPE[f.kind] ?? 5) - 1);
      if (gaps.every(g => g > 1.05) && high) {
        out.push(make("pace_down", "Rallenta i ritmi di 10\"/km",
          "Nelle ultime due sedute di qualità hai corso più piano del previsto e con sforzo elevato: i ritmi attuali sembrano troppo ambiziosi. Propongo +10\"/km su tutti i ritmi dei prossimi allenamenti.",
          { fromDate: from, toDate: null, paceShiftSec: 10 }));
      } else if (gaps.every(g => g < 0.97) && low) {
        out.push(make("pace_up", "Valuta di alzare i ritmi",
          "Nelle ultime due sedute sei andato più veloce del previsto con sforzo basso. Prima di cambiare l'obiettivo, conferma con una gara o un test; se vuoi, anticipo i ritmi di 5\"/km.",
          { fromDate: from, toDate: null, paceShiftSec: -5 }));
      }
    }
  }
  if (!out.length && latest.rpe != null && latest.rpe >= expected + 2) {
    out.push(make("reduce_light", "Riduci leggermente i prossimi 7 giorni",
      `Sforzo percepito (${latest.rpe}) sopra l'atteso (~${expected}): riduco i volumi del 10% per una settimana.`,
      { fromDate: from, toDate: to, volumeFactor: 0.9 }));
  }
  const skipped = recent.filter(f => f.completion === "skipped" && f.kind !== "extra").length;
  if (!out.length && skipped >= 2) {
    out.push(make("skips", "Sedute saltate: alleggerisci",
      `${skipped} sedute saltate negli ultimi 14 giorni. Non le recupero: riduco del 10% la prossima settimana per rientrare con calma.`,
      { fromDate: from, toDate: to, volumeFactor: 0.9 }));
  }
  return out.filter(p => !dismissed.includes(p.id) && !(plan.adjustments ?? []).some(a => a.id === p.id));
}

// Aderenza settimanale: km previsti (aggiustamenti inclusi) vs. km registrati.
export function weekAdherence(plan, weekIndex, workouts) {
  const week = plan.weeks[weekIndex];
  let planned = 0;
  for (const day of week.days) { const eff = effectiveSession(plan, day); if (eff) planned += eff.km; }
  const start = week.days[0].date, end = week.days[6].date;
  const done = workouts.filter(w => w.date >= start && w.date <= end).reduce((s, w) => s + (w.distanceKm ?? 0), 0);
  return { planned: round1(planned), done: round1(done), ratio: planned ? done / planned : 0 };
}

// Proposta sull'ultima settimana conclusa, se l'aderenza è bassa.
export function proposeFromWeek({ plan, workouts, today, dismissed = [] }) {
  const loc = locate(plan, today);
  if (loc?.state !== "in" || loc.weekIndex < 1) return [];
  const prev = loc.weekIndex - 1;
  const adh = weekAdherence(plan, prev, workouts);
  if (adh.planned <= 0 || adh.ratio >= 0.7) return [];
  const id = `week-low:${prev + 1}`;
  if (dismissed.includes(id) || (plan.adjustments ?? []).some(a => a.id === id)) return [];
  return [{ id, kind: "week-low", title: `Settimana ${prev + 1}: aderenza bassa`,
    reason: `Hai registrato ${adh.done} km su ${adh.planned} previsti. Non li recupero: riduco del 15% i prossimi 7 giorni per rientrare gradualmente.`,
    effect: { fromDate: addDays(today, 0), toDate: addDays(today, 6), volumeFactor: 0.85 } }];
}
