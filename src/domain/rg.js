// Stima del ritmo gara (RG) in maratona dai dati dell'atleta, secondo il manuale (Albanesi):
//  - mezza × 2,2 (media delle ultime tre, se disponibili);
//  - in alternativa 10 km + 30"/km (5 km convertiti in 10 km con Riegel);
//  - prima maratona: +20"/km sul RG.
// Senza dati di gara: test sui 5 km se presente, altrimenti una fascia di livello (stima prudente, "da confermare").
const MARATHON_KM = 42.195;
const RIEGEL = 1.06;

// Fasce di tempo sui 10 km per chi non ha una gara recente: si usa il centro della fascia.
export const LEVEL_BANDS = Object.freeze([
  { id: "u40", label: "Meno di 40'", tenKSec: 38 * 60 + 30 },
  { id: "40-45", label: "40'–45'", tenKSec: 42 * 60 + 30 },
  { id: "45-50", label: "45'–50'", tenKSec: 47 * 60 + 30 },
  { id: "50-55", label: "50'–55'", tenKSec: 52 * 60 + 30 },
  { id: "o55", label: "Più di 55'", tenKSec: 58 * 60 },
  { id: "unknown", label: "Non lo so", tenKSec: 60 * 60 }
]);

const tenKFrom = (sec, km) => (km === 10 ? sec : sec * (10 / km) ** RIEGEL);
const marathonFromTenK = (tenKSec, firstMarathon) => (tenKSec / 10 + 30 + (firstMarathon ? 20 : 0)) * MARATHON_KM;

export function levelBand(id) { return LEVEL_BANDS.find(b => b.id === id) ?? null; }

// Restituisce { sec, source, provisional, notes } oppure null se non ci sono dati.
// source: "mezza" | "10k" | "5k" | "test5k" | "livello"
export function estimateMarathon(profile, tests = []) {
  const first = Boolean(profile.firstMarathon);
  const notes = [];
  if (first) notes.push('Prima maratona: aggiungo 20"/km al ritmo gara stimato, come indica il manuale.');
  const done = (sec, source, provisional = false) => ({ sec: Math.round(sec / 60) * 60, source, provisional, firstMarathon: first, notes });
  const halves = (profile.recentHalvesSec ?? []).filter(Number.isFinite);
  const d = profile.recentRaceDistanceKm, t = profile.recentRaceTimeSec;
  if (d === 21.0975 && t) halves.push(t);
  if (halves.length) {
    const avg = halves.reduce((s, x) => s + x, 0) / halves.length;
    return done(avg * 2.2 + (first ? 20 * MARATHON_KM : 0), "mezza");
  }
  if ((d === 10 || d === 5) && t) return done(marathonFromTenK(tenKFrom(t, d), first), d === 10 ? "10k" : "5k");
  const t5 = [...tests].filter(x => x.type === "tt5k" && x.durationSec).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (t5) return done(marathonFromTenK(tenKFrom(t5.durationSec, 5), first), "test5k");
  const band = levelBand(profile.levelBand);
  if (band) {
    notes.push('Stima provvisoria dal livello dichiarato: da confermare con il test sui 5 km o con una gara. Per questo il ritmo è prudente.');
    return done(marathonFromTenK(band.tenKSec, first), "livello", true);
  }
  return null;
}

// Avvisi sulla qualità dei dati: la maratona si prepara partendo da una mezza.
export function estimateWarnings(est) {
  if (!est) return [];
  const out = [];
  if (est.source === "livello" || est.source === "5k" || est.source === "test5k") {
    out.push("Prima una mezza, poi la maratona: senza una mezza o una 10 km recente il ritmo gara è solo una stima. Corri una mezza (o una 10 km) nelle prime settimane e rigenera il piano con il tempo reale.");
  }
  if (est.provisional) out.push("Ritmi provvisori, da confermare: il piano parte da una stima prudente dal livello dichiarato.");
  return out;
}

// Stima del tempo di gara per mezza e 10 km da una gara recente, dal test sui 5 km o da una fascia di livello (Riegel; la mezza +2% di fatica).
export function estimateShort(key, profile, tests = []) {
  const target = key === "half" ? 21.0975 : 10, fatigue = key === "half" ? 1.02 : 1;
  const conv = (sec, km) => Math.round((sec * (target / km) ** RIEGEL * (km < target ? fatigue : 1)) / (key === "half" ? 30 : 10)) * (key === "half" ? 30 : 10);
  const d = profile.recentRaceDistanceKm, t = profile.recentRaceTimeSec;
  if (d && t) return { sec: conv(t, d), source: d === target ? "gara" : `${d === 21.0975 ? "mezza" : d + "k"}`, provisional: false, notes: [] };
  const t5 = [...tests].filter(x => x.type === "tt5k" && x.durationSec).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (t5) return { sec: conv(t5.durationSec, 5), source: "test5k", provisional: false, notes: [] };
  const band = levelBand(profile.levelBand);
  if (band) return { sec: conv(band.tenKSec, 10), source: "livello", provisional: true, notes: [] };
  return null;
}
