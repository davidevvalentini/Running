import { fmtDuration, fmtKm, fmtPace } from "./paces.js";

// Una seduta è una lista di passi con codici-ritmo. I secondi si calcolano
// al momento (measure) così un cambio di ritmo rivaluta l'intero piano.
export const run = (code, km) => ({ k: "run", code, km });
export const reps = (n, workCode, workKm, recCode, recSec) => ({ k: "reps", n, workCode, workKm, recCode, recSec });

const round1 = n => Math.round(n * 10) / 10;

export function measure(steps, paces) {
  let km = 0, sec = 0;
  for (const step of steps) {
    if (step.k === "run") { km += step.km; sec += step.km * paces[step.code]; }
    else {
      const recKm = step.recSec / paces[step.recCode];
      km += step.n * (step.workKm + recKm);
      sec += step.n * (step.workKm * paces[step.workCode] + step.recSec);
    }
  }
  return { km: round1(km), sec: Math.round(sec), avgPaceSec: km > 0 ? sec / km : 0 };
}

// Notazione compatta: "3 km RIS + 6 x (0,8 km RipM + 2'30" REC_M) + 1 km DEF"
export function notation(steps) {
  return steps.map(step => step.k === "run"
    ? `${fmtKm(step.km)} km ${step.code}`
    : `${step.n} x (${fmtKm(step.workKm)} km ${step.workCode} + ${fmtDuration(step.recSec)} ${step.recCode})`).join(" + ");
}

// Passi espansi, uno per riga, come su un orologio sportivo.
export function expandSteps(steps, paces) {
  const out = [];
  const push = (title, detail, km, sec, code) => out.push({ title, detail, km: round1(km), sec: Math.round(sec), code });
  for (const step of steps) {
    if (step.k === "run") {
      const title = { RIS: "Riscaldamento", DEF: "Defaticamento" }[step.code] ?? stepTitle(step.code);
      push(title, `${fmtKm(step.km)} km a ${fmtPace(paces[step.code])}/km`, step.km, step.km * paces[step.code], step.code);
    } else {
      for (let i = 1; i <= step.n; i++) {
        push(`Ripetuta ${i}/${step.n}`, `${fmtKm(step.workKm)} km a ${fmtPace(paces[step.workCode])}/km`, step.workKm, step.workKm * paces[step.workCode], step.workCode);
        const recKm = step.recSec / paces[step.recCode];
        push("Recupero", `${fmtDuration(step.recSec)} a ${fmtPace(paces[step.recCode])}/km (≈ ${fmtKm(recKm)} km)`, recKm, step.recSec, step.recCode);
      }
    }
  }
  return out;
}

function stepTitle(code) {
  return { "Z2-CLR": "Corsa lenta rigenerante", CL: "Corsa lenta", LQ: "Lungo di qualità", CM: "Corsa media", CV: "Corsa veloce", RG: "Ritmo gara" }[code] ?? code;
}

// Variante ridotta della seduta (aggiustamenti proposti).
export function scaleSession(session, factor) {
  if (session.kind === "race" || factor >= 1) return session;
  const steps = session.steps.map(step => {
    if (step.k === "run") {
      if (step.code === "RIS" || step.code === "DEF") return step;
      return { ...step, km: Math.max(0.5, Math.round(step.km * factor * 2) / 2) };
    }
    return { ...step, n: Math.max(2, Math.round(step.n * factor)) };
  });
  return { ...session, steps, adjusted: true };
}

export function easyReplacement(session, paces) {
  const km = Math.max(4, Math.round(measure(session.steps, paces).km * 0.85));
  return { kind: "easy", title: "Corsa lenta (qualità sostituita)", steps: [run("CL", km)], adjusted: true, note: "La qualità è stata sostituita da corsa lenta per favorire il recupero." };
}
