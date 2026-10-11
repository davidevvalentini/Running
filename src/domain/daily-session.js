const DAY_NAMES = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];

export function getDailySessionContext(plan, date) {
  if (!plan?.weeks?.length || typeof plan.startDate !== "string" || typeof date !== "string") return null;
  const startMs = Date.parse(plan.startDate + "T00:00:00Z");
  const dateMs = Date.parse(date + "T00:00:00Z");
  if (!Number.isFinite(startMs) || !Number.isFinite(dateMs) || dateMs < startMs) return null;
  const dayOffset = Math.floor((dateMs - startMs) / 86400000);
  const weekIndex = Math.floor(dayOffset / 7);
  const week = plan.weeks[weekIndex];
  if (!week) return { finished: true, weekIndex };
  const dayName = DAY_NAMES[new Date(date + "T12:00:00").getDay()];
  return {
    week, weekNumber: week.week, dayName,
    session: week.sessions.find(item => item.day === dayName) ?? null,
    nextSession: week.sessions.find(item => DAY_NAMES.indexOf(item.day) > DAY_NAMES.indexOf(dayName)) ?? null,
    date, weekIndex
  };
}

export function suggestDailyAdjustment({ completion, plannedKm, actualKm = null, rpe = null, fatigue = false, pain = false }) {
  if (!["completed", "modified", "skipped"].includes(completion)) throw new TypeError("Invalid completion status.");
  if (!Number.isFinite(plannedKm) || plannedKm < 0) throw new TypeError("plannedKm must be non-negative.");
  if (actualKm != null && (!Number.isFinite(actualKm) || actualKm <= 0)) throw new TypeError("actualKm must be positive when supplied.");
  if (rpe != null && (!Number.isInteger(rpe) || rpe < 1 || rpe > 10)) throw new TypeError("rpe must be an integer from 1 to 10.");
  if (pain) return { decision: "pause", message: "Sospendere la progressione e chiedere una valutazione professionale appropriata. Non riprendere automaticamente." };
  if (fatigue || rpe >= 8) return { decision: "reduce_or_recover", message: "Non aumentare il carico; considera una seduta facile o riposo aggiuntivo e rivaluta il recupero prima della prossima qualità. Se la fatica persiste, chiedi consiglio a un professionista." };
  if (completion === "skipped") return { decision: "maintain", message: "Non recuperare i chilometri persi. Riprendi dal prossimo allenamento previsto; se le sedute saltate si accumulano, rivedi carico o calendario." };
  if (actualKm != null && plannedKm > 0 && actualKm < plannedKm * 0.7) return { decision: "maintain", message: "La seduta è stata molto più corta del previsto. Mantieni il carico attuale o ripeti una settimana simile invece di progredire automaticamente." };
  if (completion === "completed" && rpe != null && rpe <= 6 && (actualKm == null || plannedKm === 0 || actualKm >= plannedKm * 0.85)) {
    return { decision: "maintain", message: "Seduta apparentemente ben tollerata. Continua con il piano attuale; un singolo allenamento non basta per aumentare il carico settimanale." };
  }
  return { decision: "maintain", message: "Dati insufficienti per giustificare un aumento. Mantieni il piano e valuta più sedute, recupero e RPE." };
}
