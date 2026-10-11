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

// Scarti (s/km) dal ritmo gara per ogni tipologia, misurati su piani di riferimento a obiettivi
// diversi e interpolati sul ritmo gara: ripetute e recuperi cambiano con la fascia (chi corre
// più piano fa ripetute relativamente più veloci rispetto al proprio ritmo gara).
export const PACE_TABLES = {
  "marathon": [
    [255.95, { "Z2-CLR": 64.0, CL: 44.0, LQ: 24.0, RIS: 59.0, CM: 14.0, CV: -11.0, RG: -1.0, RipB: -46.0, REC_B: 49.0, RipM: -36.0, REC_M: 59.0, RipL: -21.0, REC_L: 74.0, RipLL: -11.0, REC_LL: 89.0, DEF: 89.0 }],
    [298.61, { "Z2-CLR": 61.4, CL: 46.4, LQ: 26.4, RIS: 56.4, CM: 16.4, CV: -13.6, RG: 1.4, RipB: -43.6, REC_B: 46.4, RipM: -38.6, REC_M: 61.4, RipL: -33.6, REC_L: 76.4, RipLL: -18.6, REC_LL: 86.4, DEF: 86.4 }],
    [341.27, { "Z2-CLR": 48.7, CL: 33.7, LQ: 18.7, RIS: 53.7, CM: 8.7, CV: -16.3, RG: -1.3, RipB: -46.3, REC_B: 73.7, RipM: -41.3, REC_M: 58.7, RipL: -36.3, REC_L: 73.7, RipLL: -21.3, REC_LL: 83.7, DEF: 83.7 }],
    [383.93, { "Z2-CLR": 51.1, CL: 36.1, LQ: 21.1, RIS: 56.1, CM: 11.1, CV: -23.9, RG: 1.1, RipB: -58.9, REC_B: 66.1, RipM: -48.9, REC_M: 81.1, RipL: -38.9, REC_L: 96.1, RipLL: -28.9, REC_LL: 111.1, DEF: 111.1 }],
    [426.59, { "Z2-CLR": 48.4, CL: 33.4, LQ: 18.4, RIS: 53.4, CM: 8.4, CV: -26.6, RG: -1.6, RipB: -61.6, REC_B: 63.4, RipM: -51.6, REC_M: 78.4, RipL: -41.6, REC_L: 93.4, RipLL: -31.6, REC_LL: 108.4, DEF: 108.4 }],
  ],
  "half": [
    [255.95, { "Z2-CLR": 59.0, CL: 49.0, LQ: 19.0, RIS: 54.0, CM: 9.0, CV: -6.0, RG: -1.0, RipB: -31.0, REC_B: 69.0, RipM: -21.0, REC_M: 74.0, RipL: -11.0, REC_L: 79.0, RipLL: 4.0, REC_LL: 84.0, DEF: 84.0 }],
    [298.61, { "Z2-CLR": 61.4, CL: 51.4, LQ: 21.4, RIS: 56.4, CM: 11.4, CV: -8.6, RG: 1.4, RipB: -23.6, REC_B: 71.4, RipM: -13.6, REC_M: 76.4, RipL: -3.6, REC_L: 81.4, RipLL: 6.4, REC_LL: 86.4, DEF: 86.4 }],
    [341.27, { "Z2-CLR": 58.7, CL: 48.7, LQ: 18.7, RIS: 53.7, CM: 8.7, CV: -11.3, RG: -1.3, RipB: -26.3, REC_B: 68.7, RipM: -16.3, REC_M: 73.7, RipL: -6.3, REC_L: 78.7, RipLL: 3.7, REC_LL: 83.7, DEF: 83.7 }],
    [383.93, { "Z2-CLR": 61.1, CL: 51.1, LQ: 21.1, RIS: 56.1, CM: 11.1, CV: -8.9, RG: 1.1, RipB: -23.9, REC_B: 71.1, RipM: -13.9, REC_M: 76.1, RipL: -3.9, REC_L: 81.1, RipLL: 6.1, REC_LL: 86.1, DEF: 86.1 }],
    [426.59, { "Z2-CLR": 58.4, CL: 48.4, LQ: 18.4, RIS: 53.4, CM: 8.4, CV: -11.6, RG: -1.6, RipB: -26.6, REC_B: 68.4, RipM: -16.6, REC_M: 73.4, RipL: -6.6, REC_L: 78.4, RipLL: 3.4, REC_LL: 83.4, DEF: 83.4 }],
  ],
  "10k": [
    [240, { "Z2-CLR": 80, CL: 65, LQ: 20, RIS: 70, CM: 10, CV: -5, RG: 0, RipB: -25, REC_B: 80, RipM: -15, REC_M: 85, RipL: -5, REC_L: 90, RipLL: 0, REC_LL: 95, DEF: 95 }],
    [270, { "Z2-CLR": 75, CL: 60, LQ: 20, RIS: 65, CM: 10, CV: -5, RG: 0, RipB: -25, REC_B: 80, RipM: -15, REC_M: 85, RipL: -5, REC_L: 90, RipLL: 0, REC_LL: 95, DEF: 90 }],
    [300, { "Z2-CLR": 65, CL: 50, LQ: 20, RIS: 55, CM: 10, CV: -5, RG: 0, RipB: -20, REC_B: 70, RipM: -10, REC_M: 75, RipL: -5, REC_L: 80, RipLL: 0, REC_LL: 85, DEF: 80 }],
    [330, { "Z2-CLR": 60, CL: 45, LQ: 20, RIS: 50, CM: 10, CV: -5, RG: 0, RipB: -20, REC_B: 60, RipM: -10, REC_M: 65, RipL: -5, REC_L: 70, RipLL: 0, REC_LL: 75, DEF: 70 }],
    [360, { "Z2-CLR": 45, CL: 30, LQ: 20, RIS: 50, CM: 10, CV: -5, RG: 0, RipB: -15, REC_B: 50, RipM: -10, REC_M: 55, RipL: -5, REC_L: 60, RipLL: 0, REC_LL: 60, DEF: 60 }],
  ],
};

function offsetsFor(distance, goalPace) {
  const rows = PACE_TABLES[distance] ?? PACE_TABLES.marathon;
  if (goalPace <= rows[0][0]) return rows[0][1];
  if (goalPace >= rows.at(-1)[0]) return rows.at(-1)[1];
  const i = rows.findIndex(r => r[0] >= goalPace);
  const [g0, o0] = rows[i - 1], [g1, o1] = rows[i], t = (goalPace - g0) / (g1 - g0);
  return Object.fromEntries(Object.keys(o0).map(k => [k, o0[k] + (o1[k] - o0[k]) * t]));
}

// goalPace = ritmo della gara scelta; distance = "marathon" | "half" | "10k".
export function buildPaces(goalPace, shiftSec = 0, distance = "marathon") {
  if (!Number.isFinite(goalPace) || goalPace < 150 || goalPace > 900) throw new RangeError("Ritmo gara fuori intervallo.");
  const goal = goalPace + shiftSec, off = offsetsFor(distance, goalPace);
  const paces = {};
  for (const code of Object.keys(PACE_OFFSETS)) paces[code] = roundTo5(goal + off[code]);
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
