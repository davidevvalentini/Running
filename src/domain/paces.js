// Ritmi di allenamento derivati dal ritmo gara obiettivo.
// Gli scarti (secondi/km rispetto al ritmo gara) sono calibrati sul piano
// di riferimento a 4h00; ogni ritmo è arrotondato ai 5 secondi.

export const PACE_OFFSETS = Object.freeze({
  "Z2-CLR": 49, CL: 34, LQ: 19, RIS: 54, CM: 9, CV: -16, RG: 0, DEF: 84,
  RipB: -46, RipM: -41, RipL: -36, RipLL: -21,
  REC_B: 74, REC_M: 59, REC_L: 74, REC_LL: 84
});

export const PACE_NAMES = Object.freeze({
  RG: "Ritmo gara", "Z2-CLR": "Corsa lenta rigenerante (Z2)", LQ: "Lungo di qualità", RIS: "Riscaldamento",
  CL: "Corsa lenta", CM: "Corsa media", CV: "Corsa veloce", DEF: "Defaticamento",
  RipB: "Ripetute brevi", REC_B: "Recupero breve", RipM: "Ripetute medie", REC_M: "Recupero medio",
  RipL: "Ripetute lunghe", REC_L: "Recupero lungo", RipLL: "Ripetute molto lunghe", REC_LL: "Recupero molto lungo"
});

const round1 = n => Math.round(n * 10) / 10;
const roundTo5 = s => Math.round(s / 5) * 5;

// basePace = ritmo equivalente sulla maratona (da cui derivano tutte le zone);
// goalPace = ritmo della gara scelta (uguale a basePace per la maratona).
export function buildPaces(basePace, shiftSec = 0, goalPace = basePace) {
  if (!Number.isFinite(basePace) || basePace < 150 || basePace > 900) throw new RangeError("Ritmo gara fuori intervallo.");
  const base = basePace + shiftSec, goal = goalPace + shiftSec;
  const paces = {};
  for (const [code, offset] of Object.entries(PACE_OFFSETS)) paces[code] = code === "RG" ? roundTo5(goal) : roundTo5(base + offset);
  paces.GARA = Math.round(goal);
  return paces;
}

export const fmtPace = sec => `${Math.floor(Math.round(sec) / 60)}'${String(Math.round(sec) % 60).padStart(2, "0")}"`;
export function fmtDuration(sec) {
  const total = Math.round(sec), h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return h ? `${h}h${String(m).padStart(2, "0")}'${String(s).padStart(2, "0")}"` : `${m}'${String(s).padStart(2, "0")}"`;
}
export const fmtKm = km => String(round1(km)).replace(".", ",");
export function fmtGoal(sec) {
  const total = Math.round(sec), h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  if (!h) return `${m}'${String(s).padStart(2, "0")}"`;
  return `${h}h ${String(m).padStart(2, "0")}'${s ? ` ${String(s).padStart(2, "0")}"` : ""}`;
}
