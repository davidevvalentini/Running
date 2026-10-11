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
// Etichetta del giorno dalla data reale (la gara può cadere in qualunque giorno).
export const wdShort = iso => WEEKDAYS_SHORT[(new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7];

// Giorni della settimana-tipo (0 = primo giorno, 6 = giorno di gara/lungo).
const SLOTS_LONG = { easy: 1, quality: 2, easyB: 3, mid: 4, long: 6, easyC: 0 };
// Mezza e 10 km: qualità il giovedì, corsa lenta il sabato (martedì/giovedì/sabato/domenica a 4 giorni).
const SLOTS_SHORT = { easy: 1, quality: 3, easyB: 2, mid: 5, long: 6, easyC: 0 };

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

// Mezza maratona: riferimento 2h00, 12 settimane.
const REF_HALF = [
  { z2: 6, cl: 6, q: "M6x800", lq: 10, name: "Attivazione", phase: "base", text: "Si parte con volumi contenuti: ripetute medie il mercoledì e un lungo facile la domenica." },
  { z2: 6, cl: 8, q: "B10x400", lq: 12, name: "Ripetute brevi", phase: "base", text: "Le ripetute da 400 m svegliano le gambe. Il lungo sale a 12 km." },
  { z2: 8, cl: 8, q: "M7x1k", lq: 14, name: "Costruzione", phase: "base", text: "Ripetute da 1 km: stesso ritmo dalla prima all'ultima." },
  { z2: 6, cl: 6, q: "CM5", lq: 10, name: "Scarico", phase: "base", recovery: true, text: "Settimana di scarico: meno km, più sonno. Corri leggero." },
  { z2: 8, cl: 8, q: "M6x1k", lq: 14, tail: ["RG", 3], name: "Primo ritmo gara", phase: "build", text: "Domenica 3 km a ritmo gara in fondo al lungo: impara a riconoscere il passo." },
  { z2: 8, cl: 10, q: "LL3", lq: 14, tail: ["RG", 4], name: "Ripetute lunghe", phase: "build", text: "Ripetute da 2 km per la resistenza alla fatica; lungo con 4 km a ritmo gara." },
  { z2: 8, cl: 10, q: "CM8", lq: 16, tail: ["CM", 3], name: "Settimana chiave", phase: "build", text: "Il carico è alto: se sei stanco accorcia il lungo di 2 km." },
  { z2: 6, cl: 8, q: "CV3", lq: 12, name: "Recupero attivo", phase: "build", recovery: true, text: "Rigenera: la prossima settimana c'è il lavoro più specifico." },
  { z2: 8, cl: 10, q: "LL4", lq: 14, tail: ["RG", 5], name: "Picco specifico", phase: "specific", text: "La settimana più impegnativa: 4×2 km e lungo con 5 km a ritmo gara." },
  { z2: 8, cl: 8, q: "M6x1k", lq: 12, tail: ["RG", 4], name: "Ultimo carico", phase: "specific", text: "Ultimo lavoro di qualità prima del tapering. Mantieni il controllo." },
  { z2: 6, cl: 6, q: "CV3", lq: 10, name: "Tapering", phase: "taper", text: "I km calano: sentirsi strani è normale, stai assorbendo il lavoro." },
  { z2: 5, cl: 6, race: true, name: "Settimana di gara", phase: "taper", text: "Poco, rilassato, ben dormito. Domenica parti prudente e chiudi forte." }
];
// 10 km: 8 settimane.
const REF_10K = [
  { z2: 5, cl: 5, q: "B10x400", lq: 8, name: "Attivazione", phase: "base", text: "Prime ripetute corte e un lungo facile: costruisci la base." },
  { z2: 6, cl: 6, q: "M6x800", lq: 10, name: "Ripetute medie", phase: "base", text: "800 m tutte allo stesso ritmo, senza partire troppo forte." },
  { z2: 6, cl: 8, q: "M7x1k", lq: 11, name: "Costruzione", phase: "base", text: "Ripetute da 1 km: il lavoro che più somiglia alla gara." },
  { z2: 5, cl: 5, q: "CM5", lq: 8, name: "Scarico", phase: "base", recovery: true, text: "Scarico: volume giù, gambe fresche per il blocco successivo." },
  { z2: 6, cl: 8, q: "M6x1k", lq: 12, name: "Specifico", phase: "build", text: "Si sale di intensità: ripetute da 1 km e lungo più lungo." },
  { z2: 8, cl: 8, q: "LL3", lq: 13, name: "Picco", phase: "build", text: "La settimana più carica: 3×2 km a ritmo sostenuto." },
  { z2: 5, cl: 6, q: "CV3", lq: 8, name: "Tapering", phase: "taper", text: "Pochi km, gambe fresche. Niente test: fidati del lavoro fatto." },
  { z2: 4, cl: 5, race: true, name: "Settimana di gara", phase: "taper", text: "Corri poco, dormi molto. Domenica è il tuo giorno." }
];

// Parametri per distanza di gara.
export const DISTANCES = {
  marathon: { key: "marathon", label: "Maratona", km: 42.195, refSec: 4 * 3600, tpl: REF, minGoal: 2.5 * 3600, maxGoal: 6 * 3600, longCapKm: 32, extraWeeksBelow: 3.5 * 3600 },
  half: { key: "half", label: "Mezza maratona", km: 21.0975, refSec: 2 * 3600, tpl: REF_HALF, minGoal: 4200, maxGoal: 3 * 3600, longCapKm: 20 },
  "10k": { key: "10k", label: "10 km", km: 10, refSec: 3300, tpl: REF_10K, minGoal: 1800, maxGoal: 5400, longCapKm: 18 }
};

// Media settimanale (km) dei piani di riferimento in funzione del ritmo gara (s/km), alla frequenza consigliata.
const VOLUME_TARGETS = {
  marathon: [[255.95, 67.2], [298.61, 63.9], [341.27, 51.4], [383.93, 49.0], [426.6, 48.9]],
  half: [[255.99, 61.4], [298.61, 46.3], [341.27, 46.2], [383.93, 32.3], [426.6, 32.3]],
  "10k": [[240, 64.8], [270, 51.6], [300, 39.1], [330, 36.1], [360, 31.5]]
};
const interp = (rows, x) => {
  if (x <= rows[0][0]) return rows[0][1];
  if (x >= rows.at(-1)[0]) return rows.at(-1)[1];
  const i = rows.findIndex(r => r[0] >= x), [x0, y0] = rows[i - 1], [x1, y1] = rows[i];
  return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
};
// Giorni di corsa consigliati per fascia (come negli schemi di riferimento).
export function recommendedDays(distance, goalSec) {
  const cfg = DISTANCES[distance] ?? DISTANCES.marathon, pace = goalSec / cfg.km;
  if (cfg.key === "marathon") return pace <= 300 ? 5 : 4;
  if (cfg.key === "half") return pace <= 260 ? 5 : pace <= 345 ? 4 : 3;
  return pace <= 245 ? 6 : pace <= 275 ? 5 : 4;
}
const RIEGEL = 1.06;
export const equivalentSec = (sec, fromKm, toKm) => sec * Math.pow(toKm / fromKm, RIEGEL);

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

function longSession(spec, f, paces, cfg) {
  const longCap = cfg.key === "marathon" ? Math.min(cfg.longCapKm, Math.max(Math.floor(10800 / paces.LQ), paces.LQ >= 355 ? 30 : 0)) : cfg.longCapKm;
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

function raceSession(cfg) {
  return { kind: "race", title: cfg.label, steps: [run("GARA", cfg.km)], rpe: "—" };
}

function easySession(code, km, title) { return { kind: "easy", title, steps: [run(code, km)], rpe: code === "Z2-CLR" ? "3-4" : "4" }; }

function weekDays(spec, f, days, paces, cfg) {
  const out = Array(7).fill(null);
  const SLOTS = cfg.key === "marathon" ? SLOTS_LONG : SLOTS_SHORT;
  if (spec.race) {
    out[SLOTS.easy] = easySession("CL", scaleKm(spec.cl, f, 5), "Corsa lenta");
    out[SLOTS.quality] = easySession("Z2-CLR", scaleKm(spec.z2, f, 4), "Corsa rigenerante");
    if (cfg.key === "marathon") out[SLOTS.mid] = easySession("Z2-CLR", scaleKm(spec.z2, f, 4), "Corsa rigenerante");
    out[SLOTS.long] = raceSession(cfg);
    if (days === 3) out[SLOTS.easy] = null;
    return out;
  }
  const z2 = scaleKm(spec.z2, f);
  const cl = scaleKm(spec.cl, f);
  out[SLOTS.quality] = qualitySession(spec.q);
  out[SLOTS.long] = longSession(spec, f, paces, cfg);
  if (days === 3) {
    out[cfg.key === "marathon" ? SLOTS.mid : SLOTS.easy] = easySession("CL", cl + Math.round(z2 * 0.5), "Corsa lenta");
  } else {
    out[SLOTS.easy] = easySession("Z2-CLR", z2, "Corsa lenta rigenerante");
    out[SLOTS.mid] = easySession("CL", cl, "Corsa lenta");
    if (days >= 5) out[SLOTS.easyB] = easySession("Z2-CLR", Math.max(4, Math.round(z2 * 0.6)), "Corsa rigenerante");
    if (days >= 6) out[SLOTS.easyC] = easySession("Z2-CLR", Math.max(4, Math.round(z2 * 0.5)), "Corsa rigenerante");
  }
  return out;
}

export function volumeFactor(goalSec, refSec = 4 * 3600) {
  return clamp(1 + (refSec - goalSec) / refSec, 0.75, 1.3);
}

// Prestazioni equivalenti (Riegel) e capacità richieste per l'obiettivo.
export function requiredAbilities(goalSec, goalKm = 42.195) {
  const at = d => equivalentSec(goalSec, goalKm, d);
  const t5 = at(5), t10 = at(10), half = at(21.0975);
  const vma = (5 / t5) * 3600 * 1.06;
  return { t5, t10, half, vma: round1(vma) };
}

export function assessFeasibility(profile, week1, goalKm = 42.195) {
  const req = requiredAbilities(profile.goalTimeSec, goalKm);
  const notes = [];
  let score = 0, known = 0;
  if (profile.recentRaceDistanceKm && profile.recentRaceTimeSec) {
    const predicted = equivalentSec(profile.recentRaceTimeSec, profile.recentRaceDistanceKm, goalKm);
    const ratio = profile.goalTimeSec / predicted;
    known++;
    if (ratio >= 1.02) { score += 2; notes.push("La gara recente proietta un tempo migliore dell'obiettivo."); }
    else if (ratio >= 0.95) { score += 1; notes.push("L'obiettivo è leggermente più ambizioso di quanto proietti la gara recente: realistico con una buona preparazione."); }
    else notes.push("L'obiettivo è molto più veloce di quanto proietti la gara recente: valuta un tempo meno ambizioso.");
  } else notes.push("Nessuna gara recente: svolgi i test iniziali (scheda Oggi) per stabilire livello e passo gara realistici.");
  if (week1 && profile.weeklyKm != null && profile.longestRunKm != null) {
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
  const cfg = DISTANCES[p.distance ?? "marathon"];
  if (!cfg) errors.push("Distanza di gara non supportata.");
  else if (!Number.isFinite(p.goalTimeSec) || p.goalTimeSec < cfg.minGoal || p.goalTimeSec > cfg.maxGoal) errors.push(`Il tempo obiettivo per ${cfg.label} deve essere tra ${fmtLimit(cfg.minGoal)} e ${fmtLimit(cfg.maxGoal)}.`);
  if (!isValidISODate(p.raceDate)) errors.push("Data gara non valida.");
  if (!Number.isInteger(p.daysAvailable) || p.daysAvailable < 3 || p.daysAvailable > 6) errors.push("Scegli da 3 a 6 giorni di corsa a settimana.");
  // I km settimanali dipendono dalla fase del piano: non sono un input (restano accettati, se presenti, da profili vecchi).
  if (p.weeklyKm != null && (!Number.isFinite(p.weeklyKm) || p.weeklyKm < 0 || p.weeklyKm > 300)) errors.push("I km settimanali devono essere tra 0 e 300.");
  if (p.longestRunKm != null && (!Number.isFinite(p.longestRunKm) || p.longestRunKm < 0 || p.longestRunKm > 100)) errors.push("Il lungo recente deve essere tra 0 e 100 km.");
  const hasD = p.recentRaceDistanceKm != null, hasT = p.recentRaceTimeSec != null;
  if (hasD !== hasT) errors.push("Indica distanza e tempo della gara recente insieme.");
  if (hasD && ![5, 10, 21.0975].includes(p.recentRaceDistanceKm)) errors.push("La gara recente deve essere 5, 10 o mezza maratona.");
  if (hasT && (!Number.isFinite(p.recentRaceTimeSec) || p.recentRaceTimeSec < 600 || p.recentRaceTimeSec > 8 * 3600)) errors.push("Il tempo della gara recente non è plausibile.");
  if (p.maxHr != null && (!Number.isFinite(p.maxHr) || p.maxHr < 120 || p.maxHr > 230)) errors.push("La frequenza massima deve essere tra 120 e 230 bpm.");
  return { ok: errors.length === 0, errors };
}
const fmtLimit = sec => (sec >= 3600 ? `${Math.floor(sec / 3600)}h${String(Math.round((sec % 3600) / 60)).padStart(2, "0")}` : `${Math.round(sec / 60)}'`);

export function generatePlan(profile, options = {}) {
  const v = validateProfile(profile);
  if (!v.ok) throw new TypeError(v.errors.join(" "));
  if (profile.hasConcerningSymptoms) throw new Error("Generazione sospesa: dolore o sintomi insoliti vanno valutati prima di iniziare.");
  const cfg = DISTANCES[profile.distance ?? "marathon"];
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  if (!isValidISODate(today)) throw new RangeError("Data odierna non valida.");
  const daysToRace = Math.round((Date.parse(`${profile.raceDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY);
  if (daysToRace < 0) throw new RangeError("La data della gara deve essere futura.");
  const weeksAvail = Math.floor((daysToRace + 1) / 7);
  if (weeksAvail < 4) throw new RangeError("Servono almeno 4 settimane piene prima della gara.");

  const goalPace = profile.goalTimeSec / cfg.km;
  const paces = buildPaces(goalPace, 0, cfg.key);
  const tplWeeks = [];
  if (cfg.key === "marathon" && profile.goalTimeSec < cfg.extraWeeksBelow) {
    // Due settimane di ingresso, più leggere, prima del blocco standard.
    tplWeeks.push({ ...cfg.tpl[0], name: "Ingresso", lq: 10, z2: 6, cl: 6, text: "Due settimane di ingresso per portare la base al livello d'inizio piano. Corri facile e regolare." });
    tplWeeks.push({ ...cfg.tpl[0], name: "Ingresso progressivo", lq: 12, z2: 8, cl: 8, q: "B10x400", text: "Seconda settimana di ingresso: prime ripetute corte, ancora senza spingere." });
  }
  tplWeeks.push(...cfg.tpl);
  // Volume: si scala il modello perché la media settimanale coincida con quella dei piani di riferimento
  // per la fascia (alla frequenza consigliata, corretta per i giorni scelti).
  const rec = recommendedDays(cfg.key, profile.goalTimeSec);
  const target = interp(VOLUME_TARGETS[cfg.key], goalPace) * Math.pow(profile.daysAvailable / rec, 0.8);
  const avgAt = fv => tplWeeks.reduce((sum, spec) => sum + weekDays(spec, fv, profile.daysAvailable, paces, cfg).reduce((a, sess) => a + (sess ? measure(sess.steps, paces).km : 0), 0), 0) / tplWeeks.length;
  let f = 1;
  for (let i = 0; i < 8; i++) { const avg = avgAt(f); if (Math.abs(avg / target - 1) < 0.01) break; f = clamp(f * target / avg, 0.5, 1.8); }
  const n = Math.min(tplWeeks.length, weeksAvail);
  const used = tplWeeks.slice(tplWeeks.length - n);
  const startDate = addDays(profile.raceDate, -(n * 7 - 1));
  const warnings = [];
  if (n < tplWeeks.length) warnings.push(`Mancano ${weeksAvail} settimane: il piano completo ne prevede ${tplWeeks.length}. Parti dalla fase ${used[0].phase === "build" ? "di sviluppo" : used[0].phase === "specific" ? "specifica" : "finale"} del programma, a condizione di avere già una buona base.`);
  const minWeeks = cfg.key === "marathon" ? 10 : cfg.key === "half" ? 8 : 6;
  if (n < minWeeks) warnings.push(`Con meno di ${minWeeks} settimane la preparazione completa non è realistica: considera una gara più avanti.`);
  if (profile.daysAvailable === 3) warnings.push("Con 3 giorni a settimana il piano è compresso: la corsa rigenerante del martedì è unita alla corsa lenta del venerdì.");

  const weeks = used.map((spec, i) => {
    const days = weekDays(spec, f, profile.daysAvailable, paces, cfg).map((session, d) => ({
      date: addDays(startDate, i * 7 + d), dayIndex: d, session: session ? { ...session, id: `w${i + 1}d${d}` } : null
    }));
    const km = round1(days.reduce((s, day) => s + (day.session ? measure(day.session.steps, paces).km : 0), 0));
    return { week: i + 1, phase: spec.phase, recovery: Boolean(spec.recovery), name: spec.name, text: spec.text, days, km };
  });

  const week1 = weeks[0], longOfWeek1 = week1.days[6].session;
  const week1Info = profile.weeklyKm != null && profile.longestRunKm != null ? { km: week1.km, longKm: longOfWeek1 ? measure(longOfWeek1.steps, paces).km : 0 } : null;
  return {
    id: options.id ?? `plan-${Date.now()}`, version: 1, generatedAt: new Date().toISOString(),
    distance: cfg.key, distanceKm: cfg.km, distanceLabel: cfg.label,
    startDate, raceDate: profile.raceDate, goalTimeSec: profile.goalTimeSec, racePaceSec: goalPace, goalPaceSec: goalPace,
    daysPerWeek: profile.daysAvailable, totalWeeks: n, status: "active", weeks, warnings,
    adjustments: [], feasibility: assessFeasibility(profile, week1Info, cfg.km),
    disclaimer: "Piano indicativo, non consulto medico né coaching validato clinicamente. Interrompi in caso di dolore o sintomi insoliti. L'esito in gara non è garantito."
  };
}

export function planSummary(plan) {
  const paces = buildPaces(plan.goalPaceSec ?? plan.racePaceSec, 0, plan.distance ?? "marathon");
  const peak = plan.weeks.reduce((a, w) => (w.km > a.km ? w : a), plan.weeks[0]);
  const total = round1(plan.weeks.reduce((s, w) => s + w.km, 0));
  return { totalKm: total, avgKm: round1(total / plan.weeks.length), peakWeek: peak.week, peakKm: peak.km, paces };
}
