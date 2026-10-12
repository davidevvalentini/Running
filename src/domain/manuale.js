// Piano maratona secondo "Il manuale completo della maratona" (R. Albanesi):
// 12 settimane (8 per i più pronti), 7 sedute-giorno S1..S7 (S6 riposo, S7 domenica/giorno di gara/lungo),
// ritmi come scarti fissi dal ritmo gara RG: fondo lento FL = RG+10", fondo medio FM = RG-10",
// lunghissimo a RG+5..10" (ideale +7), lunghissimo "alla Tergat" con finale veloce, scarico e tapering.
// Le sedute sono funzioni (paces) → seduta, perché i recuperi a distanza e le sedute "a tempo"
// si traducono in secondi/km solo conoscendo i ritmi.
import { run, reps } from "./session.js";
import { manualCode as mc, REST_CODE } from "./paces.js";

const r1 = n => Math.round(n * 10) / 10;
const warm = steps => [run("RIS", 2.5), ...steps];

// Riscaldamento come passo solo nelle sedute di qualità; nelle altre è una nota (il lento si corre uniforme,
// senza usare i primi km per scaldarsi: i km indicati sono quelli del manuale).
const WARM_NOTE = "Prima: almeno 15' di corsa blanda e stretching leggero.";
const sess = (kind, title, steps, rpe, note) => ({
  kind, title, steps: kind === "quality" ? warm(steps) : steps, rpe,
  note: kind === "quality" ? note : note ? `${WARM_NOTE} ${note}` : WARM_NOTE
});

// Fondo lento.
const FL = km => () => sess("easy", `Fondo lento ${km} km`, [run("FL", km)], "4");

// Fondo progressivo: breve (≤15 km) = 2/4 lento, 1/4 RG, 1/4 medio; lungo = metà a lento,
// poi RG+5" e infine al massimo RG (non si scende sotto RG: non è un lunghissimo).
const FP = (km, { sunday = false } = {}) => () => {
  let steps;
  if (km <= 15) {
    const fl = Math.round(km / 2), rg = Math.round(km / 4);
    steps = [run("FL", fl), run(mc(0), rg), run("FM", km - fl - rg)];
  } else {
    const fl = Math.round(km / 2), a = Math.round((km - fl) / 2);
    steps = [run("FL", fl), run(mc(5), a), run(mc(0), km - fl - a)];
  }
  return sess(sunday ? "long" : "easy", `Fondo progressivo ${km} km`, steps, km > 15 ? "4-5" : "5",
    km > 15 ? "Parti al ritmo del lento e arriva nei km finali al massimo a RG: serve ad arrivare freschi, non ad andare forte." : undefined);
};

// 30' di fondo lento + 8 allunghi facili di 100 m.
const FL30 = () => paces => sess("easy", "30' fondo lento + allunghi",
  [run("FL", r1(1800 / paces.FL)), reps(8, mc(-10), 0.1, "FL", 40)], "3-4", "Gli allunghi non allenano: servono a sentire le gambe. Devono essere facili, non veloci.");

// Ripetute: n × repKm km a RG+off, recupero di corsa (recKm km al codice recCode) o da fermo (recSec).
// lastNoRec: l'ultimo recupero non si fa.
const RIP = (n, repKm, off, rec, { lastNoRec = false, kind = "quality" } = {}) => paces => {
  const work = mc(off), recSec = rec.stop ? rec.stop : Math.round(rec.km * paces[rec.code]);
  const recCode = rec.stop ? REST_CODE : rec.code;
  const steps = lastNoRec ? [reps(n - 1, work, repKm, recCode, recSec), run(work, repKm)] : [reps(n, work, repKm, recCode, recSec)];
  return sess(kind, `Ripetute ${n} × ${Math.round(repKm * 1000)} m a ${off === 0 ? "RG" : `RG${off > 0 ? "+" : "−"}${Math.abs(off)}″`}`, steps, "7-8");
};
const GIRI = (n, m, off, recKm, recCode = "FL", opts) => RIP(n, m / 1000, off, { km: recKm, code: recCode }, opts);

// Seduta composta: sequenza di blocchi continui (codice, km).
const SEQ = (kind, title, blocks, rpe, note) => () => sess(kind, title, blocks.map(([code, km]) => run(code, km)), rpe, note);

const LONG = (title, blocks, note) => SEQ("long", title, blocks, "5-6", note);

// Lunghissimo alla Tergat: ritmo costante RG+7" e accelerazione finale a RG-20".
const TERGAT = (km, fast) => LONG(`Lunghissimo alla Tergat: ${km} km a RG+7″ + ${fast} km a RG−20″`, [[mc(7), km], [mc(-20), fast]],
  "Ritmo uniforme fino agli ultimi km, poi cambia. Se non riesci a correrlo a RG+7″, fermati e analizza le cause (giornata, clima, distribuzione dello sforzo): se non trovi alibi, ritocca RG. Se negli ultimi km non scendi almeno a RG−10″ è un campanello d'allarme.");

const NONE = null;

// S1..S5, S6 (riposo = null), S7.
export const MANUALE_WEEKS = [
  { name: "Familiarizzazione", phase: "base", text: "Cerca facilità di corsa e ritmo uniforme. La mezza di domenica è un primo lunghissimo: non cercare il tempo, prova scarpe e integratori su un percorso simile a quello della gara.",
    days: [FL(15), FP(10), GIRI(3, 3000, -20, 1, mc(10)), FP(15), FL(10), NONE, LONG("Mezza di allenamento a RG", [[mc(0), 21.1]])] },
  { name: "Progressione", phase: "base", text: "Il recupero a RG+10″ è fondamentale: inutile andare forte sui mille se poi il recupero è troppo lento. Il progressivo lungo parte al ritmo del lento e non è un lunghissimo.",
    days: [FL(16), FP(10), GIRI(10, 1000, -25, 0.4, mc(10)), FP(18), FL(10), NONE, FP(24, { sunday: true })] },
  { name: "Verifica del ritmo gara", phase: "base", text: "I 3×5000 m sono la prima verifica del ritmo gara: se non riesci a rispettare i tempi, alza RG. Il progressivo di 28 km serve ad arrivare ancora freschi, non ad andare forte.",
    days: [FL(15),
      paces => sess("quality", "5000 m a RG−20″ + 8 × 500 m a RG−40″",
        [reps(1, mc(-20), 5, REST_CODE, 240), reps(8, mc(-40), 0.5, REST_CODE, 90)], "7-8"),
      FP(12), GIRI(3, 5000, -10, 1.5, "FL", { lastNoRec: true }), FL(10), NONE, FP(28, { sunday: true })] },
  { name: "Primo lunghissimo", phase: "base", text: "32 km a RG+15″ su percorso scorrevole. Allenati a bere e a usare le scarpe e l'abbigliamento del giorno della gara.",
    days: [FL(15), GIRI(4, 3000, -20, 1, mc(10)),
      FP(12),
      SEQ("quality", "Fondo medio 10 km in salita (impegno 80%)", [["FM", 10]], "6-7"),
      FL(14), NONE, LONG("Lunghissimo 32 km a RG+15″", [[mc(15), 32]])] },
  { name: "Scarico relativo", phase: "build", recovery: true, text: "Recupera il lunghissimo, anche rallentando i primi allenamenti. La mezza è a sensazione e a ritmo costante: non è una gara.",
    days: [FL(12), FP(20), SEQ("quality", "Fondo medio 14 km", [["FM", 14]], "6"), FL(15), FL(10), NONE, LONG("Mezza a sensazione (ritmo costante)", [[mc(0), 21.1]])] },
  { name: "Il bigiornaliero", phase: "build", text: "Domenica 28 km a RG+10″ e, solo se recuperi bene, 8 km di fondo lento la sera per controllare la freschezza.",
    days: [FL(12), FP(20), GIRI(4, 2000, -20, 1), FL(15), FP(12), NONE,
      LONG("Lungo 28 km a RG+10″ (+ 8 km FL la sera, opzionali)", [[mc(10), 28]], "Se la sera il lento è penoso, la settimana successiva affrontala con più calma.")] },
  { name: "Primo lunghissimo alla Tergat", phase: "build", text: "30 km a RG+7″ e gli ultimi 2 km a RG−20″. Il lunghissimo va affrontato riposati e in condizioni climatiche accettabili.",
    days: [FL(10), FL(20), GIRI(10, 1000, -10, 1, mc(20)), FL(15), FL(10), NONE, TERGAT(30, 2)] },
  { name: "Scarico", phase: "build", recovery: true, text: "Lo scarico si ottiene diminuendo quantità e qualità, non riposando. Gli allunghi servono solo a sentire le gambe.",
    days: [FL(10), FP(12), FL(20), FP(12),
      paces => sess("easy", "Fondo lento 10 km + 8 allunghi", [run("FL", 10), reps(8, mc(-10), 0.1, "FL", 40)], "4"),
      NONE, GIRI(3, 7000, 0, 1, mc(30), { kind: "long" })] },
  { name: "Lunghissimo da 36 km", phase: "specific", text: "35 km a RG+7″ + 1 km a RG−20″: è il test più importante e fissa il ritmo di partenza della maratona. Ogni incremento di distanza va programmato.",
    days: [FL(12), FL(16), SEQ("quality", "10 km a RG+20″ + 10 km a RG−5″", [[mc(20), 10], [mc(-5), 10]], "6-7",
      "Serve a vedere quanto margine hai sotto RG: se fai fatica a RG−5″ la maratona va corsa con estrema regolarità."),
      FL(10), FL30(), NONE, TERGAT(35, 1)] },
  { name: "Bigiornaliero lungo", phase: "specific", text: "Due sedute nello stesso giorno, con un pasto frugale e ipoglicidico (grassi e proteine) in mezzo: niente digiuno. Risulta più facile del lunghissimo da 36 km.",
    days: [FL30(), FL(12), FP(15), GIRI(10, 1000, -15, 0.4, mc(5)), FL(12), NONE,
      LONG("Bigiornaliero: mattina 11 km RG+15″ + 10 km RG−5″; sera idem", [[mc(15), 11], [mc(-5), 10], [mc(15), 11], [mc(-5), 10]],
        "Fra le due sedute pasto normale ma ipoglicidico. In alternativa: 7 × (4000 m a RG+20″ + 1000 m a RG−20″).")] },
  { name: "Scarico", phase: "taper", recovery: true, text: "Dimentica tempi e obiettivi. Le ripetute non sono una verifica e non si corrono sotto RG; la mezza di domenica è solo una conferma del ritmo gara.",
    days: [FL(10), FP(18), GIRI(10, 1000, 0, 0.4), FL(15), FL30(), NONE, LONG("21 km a RG: prova maratona", [[mc(0), 21]], "Non correrla più veloce del ritmo gara ricavato dal lunghissimo da 36 km: è solo un richiamo.")] },
  { name: "Settimana di gara", phase: "taper", race: true, text: "Gli ultimi 5×2000 m si corrono in scioltezza, al massimo il mercoledì. Parti con le due metà uguali; nel dubbio al ritmo del lunghissimo da 36 km.",
    days: [FL(12), RIP(5, 2, -10, { stop: 120 }), FL(10), FL30(), NONE, NONE, null] }
];

// Versione a 8 settimane (per chi ha corso diverse mezze di recente e ha il peso ottimizzato):
// si saltano le settimane 1, 2, 5 e 6.
export const MANUALE_8_WEEKS = [2, 3, 6, 7, 8, 9, 10, 11].map(i => MANUALE_WEEKS[i]);

// Sedute eliminate in base ai giorni di corsa (S1..S7 = indici 0..6): con 5 giorni si salta S5,
// con 4 giorni S1 e S5, con 3 giorni S1, S2 e S5. Con 6 si fa tutto.
const DROP = { 6: [], 5: [4], 4: [0, 4], 3: [0, 1, 4] };

// Secondi/km persi rispetto a 6 sedute settimanali (a parità di durata e intensità, dal manuale).
export const DAYS_PENALTY_SEC = { 6: 0, 5: 2, 4: 6, 3: 12 };

export function manualeWeekDays(spec, days, paces) {
  const drop = DROP[days] ?? [];
  return spec.days.map((def, i) => (def && !drop.includes(i) ? def(paces) : null));
}
