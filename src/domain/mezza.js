// Piano mezza maratona a 8 settimane, allineato al programma di un professionista (3 sedute a settimana:
// lunedì, giovedì, sabato; gara la domenica). Ritmi come scarti dal ritmo gara RG della mezza:
// fondo lento FL = RG+35″, fondo medio FM = RG+20″ (solo per la mezza, vedi buildPaces).
// Le prime settimane sono di verifica: i test stabiliscono (o correggono) il RG, che è il ritmo del test sui 5 km + 20″.
import { run, reps } from "./session.js";
import { manualCode as mc, REST_CODE } from "./paces.js";

const WARM_NOTE = "Prima: almeno 15' di corsa blanda e stretching leggero.";
const sess = (kind, title, steps, rpe, note) => ({
  kind, title, steps: kind === "quality" ? [run("RIS", 2.5), ...steps] : steps, rpe,
  note: kind === "quality" ? note : note ? `${WARM_NOTE} ${note}` : WARM_NOTE
});
const FL = km => () => sess("easy", `Fondo lento ${km} km`, [run("FL", km)], "4");
// Fondo progressivo in tre parti uguali: RG+20″, RG, RG−20″ (nel programma 5'30″, 5'10″, 4'50″).
const FP = km => () => {
  const a = Math.round(km / 3), b = Math.round(km / 3);
  return sess("easy", `Fondo progressivo ${km} km (RG+20″, RG, RG−20″)`, [run(mc(20), a), run(mc(0), b), run(mc(-20), km - a - b)], "5",
    "Tre parti uguali: parti a RG+20″, la parte centrale a RG, gli ultimi km a RG−20″.");
};
const rep = (n, repKm, off, rec, kind = "quality") => paces => {
  const recSec = rec.stop ? rec.stop : Math.round(rec.km * paces[rec.code]);
  return sess(kind, `Ripetute ${n} × ${Math.round(repKm * 1000)} m a ${off === 0 ? "RG" : `RG${off > 0 ? "+" : "−"}${Math.abs(off)}″`}`,
    [reps(n, mc(off), repKm, rec.stop ? REST_CODE : rec.code, recSec)], "7-8");
};
const TEST = (title, steps, note) => () => sess("quality", title, steps, "8-9", note);

// Lunedì, giovedì, sabato di ogni settimana (+ extra facoltativi per chi corre più di 3 giorni).
export const MEZZA_WEEKS = [
  { name: "Test iniziali", phase: "base", text: "Settimana di verifica: il test sui 5 km e le ripetute lunghe stabiliscono il ritmo gara. RG = ritmo del test sui 5 km + 20″.",
    days: { mon: TEST("Test 1: 5000 m a ritmo massimo (RG = ritmo del test + 20″)", [run(mc(-20), 5)], "Corri i 5 km al massimo sostenibile; il ritmo gara della mezza è il ritmo medio del test + 20″/km."), thu: FL(14),
      sat: TEST("Test 2: 5 × 2000 m a RG−20″ + 2′ da fermo", [reps(5, mc(-20), 2, REST_CODE, 120)], "Se non riesci a tenere RG−20″ sulle ripetute, RG è troppo veloce: ritoccalo.") } },
  { name: "Ritmo gara", phase: "base", text: "Sedute di qualità attorno al ritmo gara, con recuperi da fermo e un progressivo a tre ritmi.",
    days: { mon: () => sess("quality", "4000 m a RG + 6 × 1000 m a RG−10″ (da fermo)", [reps(1, mc(0), 4, REST_CODE, 240), reps(6, mc(-10), 1, REST_CODE, 90)], "7-8"), thu: FP(12), sat: FL(22) } },
  { name: "Mezza di allenamento", phase: "base", text: "La mezza di sabato è un test: corsa regolare a RG+15″, non una gara.",
    days: { mon: () => sess("quality", "2 × 4000 m a RG + 3 × 2000 m a RG (da fermo)", [reps(2, mc(0), 4, REST_CODE, 180), reps(3, mc(0), 2, REST_CODE, 120)], "7"), thu: FP(12),
      sat: TEST("Test 3: mezza di allenamento a RG+15″ regolare", [run(mc(15), 21.1)], "Passo regolare per tutta la distanza; obiettivo: RG+15″.") } },
  { name: "Carico", phase: "build", text: "Settimana più carica: ripetute lunghe a RG e il lungo più lungo del programma (25 km a fondo lento).",
    days: { mon: FL(12), thu: rep(4, 3, 0, { km: 1, code: mc(30) }), sat: FL(25) } },
  { name: "Test 15 km a RG", phase: "specific", text: "Il test da 15 km a RG è la verifica più importante: se non lo tieni, ritocca il ritmo gara.",
    days: { mon: FL(10), thu: TEST("Test 4: 15 km a RG", [run(mc(0), 15)], "Se non riesci a tenere RG per tutti i 15 km, il ritmo gara è troppo ambizioso."), sat: () => sess("long", "Fondo lento mezza maratona (21 km)", [run("FL", 21.1)], "4") } },
  { name: "Ripetute a ritmo gara", phase: "specific", text: "3 × 5000 m a RG+5″ con recupero corso: simulazione prolungata del ritmo gara.",
    days: { mon: rep(3, 5, 5, { km: 1.5, code: "FL" }), thu: FP(14), sat: FP(15) } },
  { name: "Rifinitura", phase: "taper", recovery: true, text: "Cala il volume: ripetute brevi a RG−10″ e il lungo lento di sabato.",
    days: { mon: rep(5, 1, -10, { km: 0.5, code: "FL" }), thu: FP(10), sat: FL(23) } },
  { name: "Settimana di gara", phase: "taper", race: true, text: "Solo un richiamo di velocità giovedì; la mezza si corre al ritmo gara, con due metà uguali.",
    days: { thu: rep(4, 0.4, -20, { km: 0.2, code: "FL" }) } }
];

const EXTRA_DAYS = { 4: [1], 5: [1, 4], 6: [1, 2, 4] };           // martedì, mercoledì, venerdì
const EXTRA_KM = { 1: 8, 2: 8, 4: 6 };

// Giorni (lun..dom): le sedute principali sono lunedì (0), giovedì (3), sabato (5); con più di 3 giorni si aggiungono fondi lenti extra.
export function mezzaWeekDays(spec, daysAvailable, paces) {
  const out = [null, null, null, null, null, null, null];
  const d = spec.days;
  if (d.mon) out[0] = d.mon(paces);
  if (d.thu) out[3] = d.thu(paces);
  if (d.sat) out[5] = d.sat(paces);
  for (const i of EXTRA_DAYS[daysAvailable] ?? []) {
    if (spec.race && i !== 1) continue;
    const km = spec.race ? 5 : EXTRA_KM[i];
    out[i] = sess("easy", `Fondo lento extra ${km} km`, [run("FL", km)], "3-4", "Seduta aggiuntiva facoltativa, non prevista dal programma di riferimento a 3 giorni.");
  }
  return out;
}
