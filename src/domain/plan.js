import { buildPaces } from "./paces.js";
import { measure, reps, run } from "./session.js";
import { isValidISODate } from "./models.js";

const DAY = 86400000;
export const WEEKDAYS = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
export const WEEKDAYS_SHORT = ["LU", "MA", "ME", "GI", "VE", "SA", "DO"];
const round1 = n => Math.round(n * 10) / 10;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export { addDays };

// Giorni della settimana-tipo (0 = primo giorno, 6 = giorno di gara/lungo).
const SLOTS = { easy: 1, quality: 2, easyB: 3, mid: 4, long: 6, easyC: 0 };

// Qualità del mercoledì. ris/def sono km di riscaldamento/defaticamento.
const Q = {
  M6x800: { ris: 3, reps: [6, "RipM", 0.8, "REC_M", 150], def: 1, title: "Ripetute medie 6 × 800 m", rpe: "7-8" },
  B10x400: { ris: 3, reps: [10, "RipB", 0.4, "REC_B", 120], def: 1, title: "Ripetute brevi 10 × 400 m", rpe: "8-9" },
  M7x1k: { ris: 2, reps: [7, "RipM", 1, "REC_M", 180], def: 1, title: "Ripetute medie 7 × 1 km", rpe: "7-8" },
  M6x1k: { ris: 2, reps: [6, "RipM", 1, "REC_M", 180], def: 1, title: "Ripetute medie 6 × 1 km", rpe: "7-8" },
  LL3: { ris: 2, reps: [3, "RipLL", 2, "REC_LL", 240], def: 1, title: "Ripetute molto lunghe 3 × 2 km", rpe: "7" },
  LL4: { ris: 2, reps: [4, "RipLL", 2, "REC_LL", 240], def: 1, title: "Ripetute molto lunghe 4 × 2 km", rpe: "7" },
  CM5: { ris: 3, cont: ["CM", 5], def: 1, title: "Corsa media 5 km", rpe: "5-6" },
  CM8: { ris: 3, cont: ["CM", 8], def: 1, title: "Corsa media 8 km", rpe: "5-6" },
  CV4: { ris: 3, cont: ["CV", 4], def: 1, title: "Corsa veloce 4 km", rpe: "6-7" },
  CV3: { ris: 3, cont: ["CV", 3], def: 1, title: "Corsa veloce 3 km", rpe: "6-7" },
  RG4: { ris: 3, cont: ["RG", 4], def: 1, title: "Richiamo ritmo gara 4 km", rpe: "5" }
};

// Km di riferimento per l'obiettivo 4h00; [z2, cl, qualità, lungo LQ, coda, defaticamento]
const REF = [
  { z2: 8, cl: 8, q: "M6x800", lq: 12, name: "Attivazione", phase: "base", text: "Si parte piano: riattiva il corpo senza forzare i ritmi. Conta la costanza; domenica goditi un lungo facile." },
  { z2: 8, cl: 10, q: "B10x400", lq: 15, name: "Prime ripetute brevi", phase: "base", text: "Mercoledì le ripetute brevi: tante ma corte (400 m). Se all'ottava sei stanco, fermati: l'obiettivo è svegliare le gambe." },
  { z2: 10, cl: 10, q: "M6x800", lq: 18, name: "Progressione controllata", phase: "base", text: "Ripetute da 800 m: tutte allo stesso ritmo, senza partire troppo forte. Il lungo sale a 18 km." },
  { z2: 10, cl: 8, q: "CM5", lq: 14, name: "Scarico", phase: "base", recovery: true, text: "Settimana di scarico: il volume scende. Dormi di più, fai mobilità e corri leggero." },
  { z2: 10, cl: 10, q: "B10x400", lq: 16, tail: ["RG", 4], name: "Assaggio di ritmo gara", phase: "build", text: "Domenica 4 km a ritmo gara in fondo al lungo: un assaggio di maratona, a gambe già cariche." },
  { z2: 12, cl: 12, q: "M7x1k", lq: 16, tail: ["CM", 5], name: "Costruzione", phase: "build", text: "Si fa sul serio: ripetute da 1 km e lungo con finale a ritmo medio. Recupera bene tra le sedute." },
  { z2: 12, cl: 14, q: "M6x1k", lq: 18, tail: ["CM", 7], name: "Settimana chiave", phase: "build", text: "Il volume è alto. Se sei troppo stanco, accorcia il lungo di 2 km: meglio arrivare sano allo scarico." },
  { z2: 10, cl: 10, q: "CM8", lq: 18, name: "Recupero attivo", phase: "build", recovery: true, text: "Hai superato il blocco centrale. Rigenera energie fisiche e mentali e corri sciolto." },
  { z2: 12, cl: 12, q: "CV4", lq: 24, name: "Resistenza continua", phase: "specific", text: "24 km a ritmo costante: a differenza dei lunghi con finale, qui conta la regolarità. Finisci col sorriso." },
  { z2: 12, cl: 12, q: "LL3", lq: 18, tail: ["CM", 4], name: "Ripetute lunghe", phase: "specific", text: "Ripetute da 2 km per costruire la resistenza alla fatica. Domenica 18 km tranquilli e finale svelto." },
  { z2: 12, cl: 12, q: "LL4", lq: 18, tail: ["RG", 6], cd: 2, name: "Volume specifico", phase: "specific", text: "Lungo di 26 km con 6 a ritmo gara: allenamento di volume, gestiscilo con calma." },
  { z2: 10, cl: 10, q: "CV3", lq: 18, name: "Semi-scarico", phase: "specific", recovery: true, text: "Ricarica le batterie: la prossima settimana c'è il picco, risparmia energie ora." },
  { z2: 12, cl: 12, q: "LL3", lq: 20, tail: ["RG", 8], cd: 2, name: "Il picco", phase: "specific", text: "Prova generale: 30 km con 8 a ritmo gara. Se porti a casa questo lavoro, la maratona è alla tua portata." },
  { z2: 8, cl: 10, q: "CV3", lq: 14, tail: ["CM", 4], name: "Inizio tapering", phase: "taper", text: "Il lavoro duro è fatto: si riducono i km. Sentirsi pesanti o strani è normale, il corpo sta riparando." },
  { z2: 8, cl: 8, q: "RG4", lq: 12, name: "Fiducia", phase: "taper", text: "Solo richiami brevi. Non testare la forma correndo forte: riposa, idratati, visualizza il traguardo." },
  { z2: 6, cl: 8, race: true, name: "Settimana di gara", phase: "taper", text: "Corri pochissimo, rilassati e dormi. Domenica è la tua festa: parti prudente e goditela." }
];

const KIND_BY_Q = { reps: "quality", cont: "quality" };

function qualitySession(key) {
  const q = Q[key];
  const steps = [run("RIS", q.ris)];
  if (q.reps) steps.push(reps(...q.reps));
  else steps.push(run(q.cont[0], q.cont[1]));
  steps.push(run("DEF", q.def));
  return { kind: KIND_BY_Q[q.reps ? "reps" : "cont"], title: q.title, steps, rpe: q.rpe };
}

function scaleKm(km, f, min = 4) { return Math.max(min, Math.round(km * f)); }

function longSession(spec, f, paces, raceTail) {
  const longCap = Math.min(32, Math.floor(10800 / paces.LQ));
  let lq = scaleKm(spec.lq, f, 8);
  let tail = spec.tail ? [spec.tail[0], scaleKm(spec.tail[1], f, 2)] : null;
  let cd = spec.cd ? scaleKm(spec.cd, f, 1) : 0;
  const total = () => lq + (tail?.[1] ?? 0) + cd;
  // Regola delle 3 ore: il lungo non supera ~3h di corsa.
  while (total() > longCap && lq > 8) lq -= 1;
  const steps = [run("LQ", lq)];
  if (tail) steps.push(run(tail[0], tail[1]));
  if (cd) steps.push(run("CL", cd));
  const title = tail ? `Lungo con ${tail[1]} km a ${tail[0] === "RG" ? "ritmo gara" : "ritmo medio"}` : "Lungo di qualità";
  return { kind: "long", title, steps, rpe: tail ? "4-6" : "4-5" };
}

function raceSession() {
  return { kind: "race", title: "Maratona", steps: [run("GARA", 42.195)], rpe: "—" };
}

function easySession(code, km, title) { return { kind: "easy", title, steps: [run(code, km)], rpe: code === "Z2-CLR" ? "3-4" : "4" }; }

function weekDays(spec, f, days, paces) {
  const out = Array(7).fill(null);
  if (spec.race) {
    out[SLOTS.easy] = easySession("CL", scaleKm(spec.cl, f, 5), "Corsa lenta");
    out[SLOTS.quality] = easySession("Z2-CLR", scaleKm(spec.z2, f, 4), "Corsa rigenerante");
    out[SLOTS.mid] = easySession("Z2-CLR", scaleKm(spec.z2, f, 4), "Corsa rigenerante");
    out[SLOTS.long] = raceSession();
    if (days === 3) out[SLOTS.easy] = null;
    return out;
  }
  const z2 = scaleKm(spec.z2, f);
  const cl = scaleKm(spec.cl, f);
  out[SLOTS.quality] = qualitySession(spec.q);
  out[SLOTS.long] = longSession(spec, f, paces);
  if (days === 3) {
    out[SLOTS.mid] = easySession("CL", cl + Math.round(z2 * 0.5), "Corsa lenta");
  } else {
    out[SLOTS.easy] = easySession("Z2-CLR", z2, "Corsa lenta rigenerante");
    out[SLOTS.mid] = easySession("CL", cl, "Corsa lenta");
    if (days >= 5) out[SLOTS.easyB] = easySession("Z2-CLR", Math.max(4, Math.round(z2 * 0.6)), "Corsa rigenerante");
    if (days >= 6) out[SLOTS.easyC] = easySession("Z2-CLR", Math.max(4, Math.round(z2 * 0.5)), "Corsa rigenerante");
  }
  return out;
}

export function volumeFactor(goalSec) {
  return clamp(1 + (4 * 3600 - goalSec) / (4 * 3600), 0.75, 1.3);
}

// Prestazioni equivalenti (Riegel, esponente 1,06) e capacità richieste.
export function requiredAbilities(goalSec) {
  const at = d => goalSec * Math.pow(d / 42.195, 1.06);
  const t5 = at(5), t10 = at(10), half = at(21.0975);
  const vma = (5 / t5) * 3600 * 1.06;
  return { t5, t10, half, vma: round1(vma) };
}

export function assessFeasibility(profile, week1) {
  const req = requiredAbilities(profile.goalTimeSec);
  const notes = [];
  let score = 0, known = 0;
  if (profile.recentRaceDistanceKm && profile.recentRaceTimeSec) {
    const predicted = profile.recentRaceTimeSec * Math.pow(42.195 / profile.recentRaceDistanceKm, 1.06);
    const ratio = profile.goalTimeSec / predicted;
    known++;
    if (ratio >= 1.02) { score += 2; notes.push("La gara recente proietta un tempo maratona migliore dell'obiettivo."); }
    else if (ratio >= 0.95) { score += 1; notes.push("L'obiettivo è leggermente più ambizioso di quanto proietti la gara recente: realistico con una buona preparazione."); }
    else notes.push("L'obiettivo è molto più veloce di quanto proietti la gara recente: valuta un tempo meno ambizioso.");
  } else notes.push("Nessuna gara recente: aggiungila al profilo per una valutazione più affidabile.");
  if (week1) {
    known++;
    const volRatio = profile.weeklyKm / Math.max(1, week1.km);
    const longRatio = profile.longestRunKm / Math.max(1, week1.longKm);
    if (volRatio >= 0.9 && longRatio >= 0.9) { score += 2; notes.push("Il tuo carico attuale è già in linea con la prima settimana del piano."); }
    else if (volRatio >= 0.65 && longRatio >= 0.65) { score += 1; notes.push("Il carico attuale è un po' sotto la prima settimana: parti con cautela e riduci se serve."); }
    else notes.push("Il carico attuale è molto sotto la prima settimana: costruisci prima una base o riduci i volumi iniziali.");
  }
  let level = "n/d";
  if (known) { const avg = score / known; level = avg >= 1.5 ? "Alta" : avg >= 0.75 ? "Media" : "Bassa"; }
  return { level, notes, required: req };
}

export function validateProfile(p) {
  const errors = [];
  if (!p || typeof p !== "object") return { ok: false, errors: ["Profilo non valido."] };
  if (!Number.isFinite(p.goalTimeSec) || p.goalTimeSec < 2.5 * 3600 || p.goalTimeSec > 6 * 3600) errors.push("Il tempo obiettivo deve essere tra 2h30 e 6h00.");
  if (!isValidISODate(p.raceDate)) errors.push("Data gara non valida.");
  if (!Number.isInteger(p.daysAvailable) || p.daysAvailable < 3 || p.daysAvailable > 6) errors.push("Scegli da 3 a 6 giorni di corsa a settimana.");
  if (!Number.isFinite(p.weeklyKm) || p.weeklyKm < 0 || p.weeklyKm > 300) errors.push("I km settimanali devono essere tra 0 e 300.");
  if (!Number.isFinite(p.longestRunKm) || p.longestRunKm < 0 || p.longestRunKm > 100) errors.push("Il lungo recente deve essere tra 0 e 100 km.");
  const hasD = p.recentRaceDistanceKm != null, hasT = p.recentRaceTimeSec != null;
  if (hasD !== hasT) errors.push("Indica distanza e tempo della gara recente insieme.");
  if (hasD && ![5, 10, 21.0975].includes(p.recentRaceDistanceKm)) errors.push("La gara recente deve essere 5, 10 o mezza maratona.");
  return { ok: errors.length === 0, errors };
}

export function generatePlan(profile, options = {}) {
  const v = validateProfile(profile);
  if (!v.ok) throw new TypeError(v.errors.join(" "));
  if (profile.hasConcerningSymptoms) throw new Error("Generazione sospesa: dolore o sintomi insoliti vanno valutati prima di iniziare.");
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  if (!isValidISODate(today)) throw new RangeError("Data odierna non valida.");
  const daysToRace = Math.round((Date.parse(`${profile.raceDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY);
  if (daysToRace < 0) throw new RangeError("La data della gara deve essere futura.");
  const weeksAvail = Math.floor((daysToRace + 1) / 7);
  if (weeksAvail < 4) throw new RangeError("Servono almeno 4 settimane piene prima della gara.");

  const racePace = profile.goalTimeSec / 42.195;
  const paces = buildPaces(racePace);
  const f = volumeFactor(profile.goalTimeSec);
  const fullWeeks = profile.goalTimeSec < 3.5 * 3600 ? 18 : 16;
  const tplWeeks = [];
  if (fullWeeks === 18) {
    // Due settimane di ingresso, più leggere, prima del blocco standard.
    tplWeeks.push({ ...REF[0], name: "Ingresso", lq: 10, z2: 6, cl: 6, text: "Due settimane di ingresso per portare la base al livello d'inizio piano. Corri facile e regolare." });
    tplWeeks.push({ ...REF[0], name: "Ingresso progressivo", lq: 12, z2: 8, cl: 8, q: "B10x400", text: "Seconda settimana di ingresso: prime ripetute corte, ancora senza spingere." });
  }
  tplWeeks.push(...REF);
  const n = Math.min(tplWeeks.length, weeksAvail);
  const used = tplWeeks.slice(tplWeeks.length - n);
  const startDate = addDays(profile.raceDate, -(n * 7 - 1));
  const warnings = [];
  if (n < tplWeeks.length) warnings.push(`Mancano ${weeksAvail} settimane: il piano completo ne prevede ${tplWeeks.length}. Parti dalla fase ${used[0].phase === "build" ? "di sviluppo" : used[0].phase === "specific" ? "specifica" : "finale"} del programma, a condizione di avere già una buona base.`);
  if (n < 10) warnings.push("Con meno di 10 settimane la preparazione completa non è realistica: considera una gara più avanti.");
  if (profile.daysAvailable === 3) warnings.push("Con 3 giorni a settimana il piano è compresso: la corsa rigenerante del martedì è unita alla corsa lenta del venerdì.");

  const weeks = used.map((spec, i) => {
    const days = weekDays(spec, f, profile.daysAvailable, paces).map((session, d) => ({
      date: addDays(startDate, i * 7 + d), dayIndex: d, session: session ? { ...session, id: `w${i + 1}d${d}` } : null
    }));
    const km = round1(days.reduce((s, day) => s + (day.session ? measure(day.session.steps, { ...paces }).km : 0), 0));
    return { week: i + 1, phase: spec.phase, recovery: Boolean(spec.recovery), name: spec.name, text: spec.text, days, km };
  });

  const week1 = weeks[0], longOfWeek1 = week1.days[6].session;
  const week1Info = { km: week1.km, longKm: longOfWeek1 ? measure(longOfWeek1.steps, paces).km : 0 };
  return {
    id: options.id ?? `plan-${Date.now()}`, version: 1, generatedAt: new Date().toISOString(),
    startDate, raceDate: profile.raceDate, goalTimeSec: profile.goalTimeSec, racePaceSec: racePace,
    daysPerWeek: profile.daysAvailable, totalWeeks: n, status: "active", weeks, warnings,
    adjustments: [], feasibility: assessFeasibility(profile, week1Info),
    disclaimer: "Piano indicativo, non consulto medico né coaching validato clinicamente. Interrompi in caso di dolore o sintomi insoliti. L'esito in gara non è garantito."
  };
}

export function planSummary(plan) {
  const paces = buildPaces(plan.racePaceSec);
  const peak = plan.weeks.reduce((a, w) => (w.km > a.km ? w : a), plan.weeks[0]);
  const total = round1(plan.weeks.reduce((s, w) => s + w.km, 0));
  return { totalKm: total, avgKm: round1(total / plan.weeks.length), peakWeek: peak.week, peakKm: peak.km, paces };
}
