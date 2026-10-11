// Test iniziali: stabiliscono il livello di partenza e il passo gara realistico.
//  - base30: 30 minuti di corsa continua facile  -> ritmo facile e base aerobica
//  - tt5k:   5 km a ritmo massimo sostenibile     -> previsioni di gara
import { equivalentSec, DISTANCES } from "./plan.js";
import { fmtDuration, fmtGoal, fmtPace } from "./paces.js";

export const TEST_DEFS = [
  {
    id: "base30", title: "Test 1 · Corsa facile di 30 minuti",
    why: "Misura il tuo ritmo facile e la base aerobica di partenza.",
    how: ["5' di camminata veloce o corsa lentissima", "30' di corsa continua a ritmo conversazionale (RPE 3–4/10), senza fermarti", "5' di defaticamento"],
    field: "Distanza percorsa nei 30' (km)"
  },
  {
    id: "tt5k", title: "Test 2 · 5 km a ritmo massimo",
    why: "Stabilisce il passo gara realistico: da questo tempo si stimano 10 km, mezza e maratona.",
    how: ["15' di riscaldamento facile + 4 allunghi di 20\"", "5 km al ritmo più veloce che riesci a mantenere per tutta la distanza (RPE 9/10), possibilmente in piano", "10' di defaticamento. Fallo riposato, a 2–3 giorni dall'ultima seduta intensa"],
    field: "Tempo sui 5 km"
  }
];

// Fattore di fatica oltre i 5 km: la formula di Riegel è ottimistica sulle distanze lunghe senza una base specifica.
const FATIGUE = { 5: 1, 10: 1, 21.0975: 1.02, 42.195: 1.04 };

export function predictRaces(t5Sec) {
  const at = d => equivalentSec(t5Sec, 5, d) * (FATIGUE[d] ?? 1);
  return { "10k": at(10), half: at(21.0975), marathon: at(42.195), vma: Math.round((5 / t5Sec) * 3600 * 1.06 * 10) / 10 };
}

const lastOf = (tests, id) => [...tests].filter(t => t.type === id).sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
export const latestTest = lastOf;

// Quanto l'obiettivo è realistico, dato il test sui 5 km.
export function evaluateGoal({ goalSec, distance, tests }) {
  const t = lastOf(tests ?? [], "tt5k");
  if (!t || !t.durationSec) return null;
  const cfg = DISTANCES[distance] ?? DISTANCES.marathon;
  const key = cfg.key === "10k" ? "10k" : cfg.key;
  const predicted = predictRaces(t.durationSec)[key];
  const ratio = goalSec / predicted;
  const verdict = ratio >= 1.05 ? "comodo" : ratio >= 0.97 ? "realistico" : ratio >= 0.92 ? "ambizioso" : "fuori portata";
  const step = key === "10k" ? 10 : 60;
  const realistic = Math.round(predicted / step) * step;
  const notes = [];
  if (t.rpe != null && t.rpe < 8) notes.push("Hai indicato uno sforzo sotto l'8/10: il test potrebbe essere stato troppo prudente e la stima è pessimistica.");
  if (verdict === "fuori portata") notes.push("Il tempo obiettivo è molto più veloce di quanto il test faccia prevedere: un obiettivo meno ambizioso riduce il rischio di infortuni e di crollo in gara.");
  if (verdict === "ambizioso") notes.push("Obiettivo ambizioso ma non impossibile: richiede un'ottima continuità di allenamento.");
  if (verdict === "comodo") notes.push("Il test indica che puoi puntare più in alto.");
  return { testSec: t.durationSec, predictedSec: predicted, realisticGoalSec: realistic, ratio, verdict, notes, predictions: predictRaces(t.durationSec) };
}

// Base aerobica dal test facile di 30': ritmo reale contro quello previsto dal piano per la corsa lenta.
export function evaluateBase({ z2PaceSec, tests }) {
  const t = lastOf(tests ?? [], "base30");
  if (!t || !(t.distanceKm > 0)) return null;
  const paceSec = 1800 / t.distanceKm, ratio = paceSec / z2PaceSec;
  const level = ratio <= 1.03 ? "in linea" : ratio <= 1.12 ? "leggermente sotto" : "sotto";
  const notes = [];
  if (level !== "in linea") notes.push(`Il tuo ritmo facile (${fmtPace(paceSec)}/km) è più lento di quello della corsa lenta del piano (${fmtPace(z2PaceSec)}/km): nelle prime settimane conta lo sforzo, non il passo.`);
  if (t.rpe != null && t.rpe >= 7) notes.push("Per un test facile lo sforzo è stato alto: la base aerobica è ancora da costruire.");
  return { paceSec, ratio, level, cautious: level === "sotto" || (t.rpe != null && t.rpe >= 7), notes };
}

export function levelSummary({ goalEval, baseEval }) {
  if (!goalEval && !baseEval) return null;
  const parts = [];
  if (baseEval) parts.push(`base aerobica ${baseEval.level}`);
  if (goalEval) parts.push(`obiettivo ${goalEval.verdict}`);
  return parts.join(" · ");
}

// Proposte che nascono dai test (mai automatiche).
export function proposeFromTests({ plan, goalSec, distance, tests, paces, today, dismissed = [] }) {
  const out = [], adj = plan.adjustments ?? [];
  const goal = evaluateGoal({ goalSec, distance, tests });
  if (goal && goal.verdict !== "realistico") {
    const id = `goal:${tests.filter(x => x.type === "tt5k").at(-1)?.id ?? goal.testSec}`;
    const label = fmtGoalFor(distance, goal.realisticGoalSec);
    if (goal.verdict === "comodo" && Math.abs(goal.realisticGoalSec - goalSec) >= 60) out.push({ id, kind: "goal", title: `Punta più in alto: ${label}`, reason: `Dal test sui 5 km (${fmtDuration(goal.testSec)}) la stima è ${label}. Rigenero il piano con questo obiettivo, ritmi inclusi.`, effect: null, newGoalSec: goal.realisticGoalSec });
    if ((goal.verdict === "ambizioso" || goal.verdict === "fuori portata") && goal.realisticGoalSec > goalSec) out.push({ id, kind: "goal", title: `Obiettivo realistico: ${label}`, reason: `Dal test sui 5 km (${fmtDuration(goal.testSec)}) la stima è ${label}, contro l'obiettivo di ${fmtGoalFor(distance, goalSec)}. Rigenero il piano con ritmi e volumi del nuovo obiettivo.`, effect: null, newGoalSec: goal.realisticGoalSec });
  }
  const base = evaluateBase({ z2PaceSec: paces["Z2-CLR"], tests });
  if (base?.cautious) {
    const start = plan.startDate;
    const id = `start-cautious:${tests.filter(x => x.type === "base30").at(-1)?.id ?? "x"}`;
    out.push({ id, kind: "start-cautious", title: "Parti con volumi ridotti", reason: "Il test di base indica una base aerobica ancora da costruire: riduco del 15% i volumi delle prime due settimane (senza recuperare nulla dopo).", effect: { fromDate: start, toDate: addDaysLocal(start, 13), volumeFactor: 0.85 } });
  }
  return out.filter(p => !dismissed.includes(p.id) && !adj.some(a => a.id === p.id) && !(p.effect?.toDate && p.effect.toDate < today));
}

function fmtGoalFor(distance, sec) { return distance === "10k" ? fmtGoal(sec) : fmtGoal(sec); }
function addDaysLocal(iso, n) { return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10); }
