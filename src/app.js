import { generatePlan, reviewTrainingWeek, applyAdjustment, getLatestCompletedPlanWeek } from "./domain/engine.js";
import { createWorkout, validateRunner } from "./domain/models.js";
import { createLocalStore } from "./storage/local-store.js";
import { previewActivities } from "./import/activities.js";

const store = createLocalStore();
let state = store.read();
let currentPreview = null;
const $ = selector => document.querySelector(selector);
const today = () => new Date().toISOString().slice(0, 10);
const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[ch]));
const labels = { beginner:"Principiante", intermediate:"Intermedio", advanced:"Evoluto", base:"Base", build:"Sviluppo", specific:"Specificità", taper:"Taper", run_walk:"Corsa/camminata", easy:"Corsa facile", long:"Lungo", threshold:"Soglia controllata", intervals:"Intervalli controllati", marathon_pace:"Ritmo maratona (solo se validato)" };

function persist() { store.write(state); }
function paceToSeconds(value) {
  if (!value.trim()) return null;
  const m = value.trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (!m) throw new Error("Inserisci il passo come mm:ss oppure lascia il campo vuoto.");
  const seconds = Number(m[1]) * 60 + Number(m[2]);
  if (seconds < 150 || seconds > 1200) throw new Error("Il passo inserito è fuori dall'intervallo accettato.");
  return seconds;
}
function parseRaceTime(value) {
  if (!value.trim()) return null;
  const parts = value.trim().split(":");
  if (parts.length !== 2 && parts.length !== 3) throw new Error("Inserisci il tempo gara come mm:ss oppure h:mm:ss.");
  if (parts.some(part => !/^\d+$/.test(part))) throw new Error("Il tempo gara deve essere mm:ss oppure h:mm:ss.");
  const numbers = parts.map(Number);
  if (numbers.some((n, i) => i > 0 && n > 59)) throw new Error("Minuti e secondi dopo i due punti devono essere inferiori a 60.");
  const seconds = parts.length === 2 ? numbers[0] * 60 + numbers[1] : numbers[0] * 3600 + numbers[1] * 60 + numbers[2];
  if (seconds < 600 || seconds > 8 * 3600) throw new Error("Il tempo gara è fuori dall'intervallo accettato.");
  return seconds;
}
function readRunner(form) {
  const data = new FormData(form);
  return {
    id: state.runners[0]?.id ?? "runner-local",
    level: String(data.get("level")),
    raceDate: String(data.get("raceDate")),
    weeklyKm: Number(data.get("weeklyKm")),
    longestRunKm: Number(data.get("longestRunKm")),
    daysAvailable: Number(data.get("daysAvailable")),
    recentPaceSecPerKm: paceToSeconds(String(data.get("recentPace") ?? "")),
    recentRaceDistanceKm: data.get("recentRaceDistance") ? Number(data.get("recentRaceDistance")) : null,
    recentRaceTimeSec: parseRaceTime(String(data.get("recentRaceTime") ?? "")),
    hasConcerningSymptoms: data.get("symptoms") === "on"
  };
}
function formatRaceTime(seconds) {
  const total = Math.round(seconds), h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  return h ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${m}:${String(s).padStart(2,"0")}`;
}
function renderPlan(plan) {
  $("#plan-section").hidden = false;
  $("#plan-summary").innerHTML = [
    ["Livello", labels[plan.level] ?? plan.level],
    ["Orizzonte", `${plan.totalWeeks} settimane`],
    ["Carico attuale", labels[plan.context.loadBand] ?? plan.context.loadBand]
  ].map(([title,value]) => `<div class="summary-card"><span>${esc(title)}</span><strong>${esc(value)}</strong></div>`).join("");
  $("#plan-warnings").innerHTML = plan.warnings.map(w => `<div class="warning">⚠ ${esc(w)}</div>`).join("");
  $("#pace-zones")?.remove();
  if (plan.paceZones) {
    const zones = document.createElement("div");
    zones.id = "pace-zones"; zones.className = "pace-zones";
    zones.innerHTML = `<h3>Zone di ritmo indicative</h3><p>Stimate dalla gara recente inserita: ${esc(plan.paceZones.sourceDistanceKm)} km in ${esc(formatRaceTime(plan.paceZones.sourceTimeSec))}. Sono riferimenti iniziali, non soglie misurate; regola sempre in base a fatica, condizioni e recupero.</p><div class="pace-grid">${[["Facile / lungo",plan.paceZones.labels.easy],["Ritmo maratona teorico",plan.paceZones.labels.marathon],["Soglia controllata",plan.paceZones.labels.threshold],["Intervalli",plan.paceZones.labels.intervals]].map(([name,pace])=>`<div><span>${esc(name)}</span><strong>${esc(pace)}</strong></div>`).join("")}</div><small>${esc(plan.paceZones.disclaimer)}</small>`;
    $("#plan-summary").after(zones);
  }
  $("#plan-weeks").innerHTML = plan.weeks.map(week => `<details class="week-card" ${week.week === 1 ? "open" : ""}>
    <summary><span class="week-num">W${String(week.week).padStart(2,"0")}</span><span><span class="week-title">${esc(week.recovery ? "Settimana di recupero" : "Settimana " + week.week)}</span><span class="week-sub"> · ${esc(week.guidance)}</span></span><span class="phase">${esc(labels[week.phase] ?? week.phase)}</span><span class="week-km">${week.targetKm.toLocaleString("it-IT")} km</span></summary>
    <div class="session-list">${week.sessions.map((s,i) => `<div class="session"><div><strong>${esc(s.day ? s.day + " · " : "")}${esc(labels[s.type] ?? s.type)}</strong><small>${esc(s.effort)}${s.note ? " · "+esc(s.note) : ""}</small>${s.structure ? `<small class="session-structure">Riscaldamento ${s.structure.warmupKm.toLocaleString("it-IT")} km · Parte centrale ${s.structure.mainKm.toLocaleString("it-IT")} km · Defaticamento ${s.structure.cooldownKm.toLocaleString("it-IT")} km</small><small class="session-main">${esc(s.structure.mainSet)}</small>` : ""}</div><b>${s.distanceKm.toLocaleString("it-IT")} km</b></div>`).join("")}</div>
  </details>`).join("");
  $("#plan-section").scrollIntoView({behavior:"smooth",block:"start"});
}
function renderHistory() {
  const workouts = [...state.workouts].sort((a,b) => b.date.localeCompare(a.date)).slice(0,8);
  $("#workout-history").innerHTML = workouts.length ? workouts.map(w => `<div class="history-item"><time>${esc(w.date)}</time><div><strong>${w.distanceKm != null ? w.distanceKm.toLocaleString("it-IT")+" km" : "Distanza non indicata"}</strong><small>${w.durationSec ? " · "+Math.round(w.durationSec/60)+" min" : ""}${w.rpe ? " · RPE "+w.rpe : ""} · ${esc(w.source)}</small></div><button class="text-button remove-workout" data-id="${esc(w.id)}" type="button" aria-label="Elimina allenamento">Elimina</button></div>`).join("") : '<div class="empty">Gli allenamenti registrati appariranno qui.</div>';
}
function saveWorkout(input) {
  const workout = createWorkout(input);
  if (workout.externalId && state.workouts.some(w => w.source === workout.source && w.externalId === workout.externalId)) return false;
  state.workouts.push(workout); persist(); renderHistory(); return true;
}

$("#profile-form").addEventListener("submit", event => {
  event.preventDefault();
  const error = $("#profile-error"); error.hidden = true;
  try {
    const runner = readRunner(event.currentTarget);
    const validation = validateRunner(runner);
    if (!validation.ok) throw new Error(validation.errors.join(" "));
    if (runner.hasConcerningSymptoms) throw new Error("Il piano non viene generato perché hai segnalato dolore o sintomi insoliti. Sospendi la progressione e chiedi una valutazione professionale appropriata.");
    const plan = generatePlan(runner, {today:today()});
    state.runners = [runner]; state.plans = [plan, ...state.plans].slice(0,10); persist(); renderPlan(plan);
  } catch (e) { error.textContent = e.message; error.hidden = false; }
});
$("#activity-form").elements.date.value = today();
$("#activity-form").addEventListener("submit", event => {
  event.preventDefault();
  const form = event.currentTarget, data = new FormData(form), message = $("#activity-message");
  try {
    const added = saveWorkout({
      date: String(data.get("date")), distanceKm: Number(data.get("distanceKm")),
      durationSec: data.get("durationSec") ? Number(data.get("durationSec")) : null,
      rpe: data.get("rpe") ? Number(data.get("rpe")) : null,
      notes: String(data.get("notes") ?? ""), source:"manual"
    });
    message.textContent = added ? "Allenamento salvato sul dispositivo." : "Questa attività risulta già importata.";
    message.hidden = false; form.reset(); form.elements.date.value = today();
  } catch(e) { message.textContent = e.message; message.hidden = false; }
});
$("#workout-history").addEventListener("click", event => {
  const button = event.target.closest(".remove-workout");
  if (!button) return;
  state.workouts = state.workouts.filter(w => w.id !== button.dataset.id); persist(); renderHistory();
});
$("#activity-file").addEventListener("change", async event => {
  const file = event.target.files?.[0]; if (!file) return;
  const target = $("#import-preview"); target.hidden = false; currentPreview = null;
  try {
    const ext = file.name.split(".").pop().toLowerCase();
    if (ext === "fit") throw new Error("Il formato FIT richiede un decoder non ancora incluso. Esporta l'attività in GPX, TCX o CSV.");
    const text = await file.text();
    currentPreview = previewActivities({name:file.name,size:file.size,text,format:ext});
    target.innerHTML = `<div class="preview-card"><strong>Anteprima: ${currentPreview.count} attività</strong><p class="form-note">${esc(currentPreview.warnings[0])}</p>${currentPreview.activities.slice(0,8).map((w,i)=>`<div class="preview-row"><span>${esc(w.date)}</span><span>${w.distanceKm != null ? w.distanceKm.toLocaleString("it-IT")+" km" : ""}${w.durationSec ? " · "+Math.round(w.durationSec/60)+" min" : ""}</span></div>`).join("")}<p class="form-note">Le attività non mostrate (${Math.max(0,currentPreview.count-8)}) saranno incluse se confermi.</p><button id="confirm-import" class="secondary-button" type="button">Conferma importazione</button></div>`;
  } catch(e) { target.innerHTML = `<div class="warning">${esc(e.message)}</div>`; }
});
$("#import-preview").addEventListener("click", event => {
  if (event.target.id !== "confirm-import" || !currentPreview) return;
  let added = 0, duplicates = 0;
  for (const item of currentPreview.activities) {
    if (saveWorkout({...item, id:undefined})) added++; else duplicates++;
  }
  $("#import-preview").innerHTML = `<div class="message">Importazione completata: ${added} aggiunte, ${duplicates} duplicati ignorati.</div>`;
  currentPreview = null; $("#activity-file").value = "";
});
$("#export-button").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state,null,2)], {type:"application/json"});
  const url = URL.createObjectURL(blob); const link = document.createElement("a");
  link.href=url; link.download="running-planner-export.json"; link.click(); URL.revokeObjectURL(url);
});

$("#review-form").addEventListener("submit", event => {
  event.preventDefault();
  const message = $("#review-message");
  try {
    const runner = state.runners[0];
    if (!runner) throw new Error("Prima salva il profilo e genera un piano.");
    const data = new FormData(event.currentTarget);
    const activePlan = state.plans[0];
    if (!activePlan) throw new Error("Genera prima un piano per poter confrontare le attività con una settimana pianificata.");
    if (activePlan.status === "paused" || runner.hasConcerningSymptoms) {
      throw new Error("Il piano risulta sospeso. Non viene applicato alcun adattamento automatico: serve una valutazione appropriata prima di riprendere.");
    }
    const completedWeek = getLatestCompletedPlanWeek(activePlan, today());
    if (!completedWeek) {
      throw new Error("Non c'è ancora una settimana completa del piano da valutare. La revisione sarà disponibile dopo i primi 7 giorni.");
    }
    const recent = state.workouts.filter(w => w.date >= completedWeek.startDate && w.date <= completedWeek.endDate);
    const review = reviewTrainingWeek({
      runner, plannedKm: completedWeek.week.targetKm, completedWorkouts: recent,
      missedSessions: Number(data.get("missedSessions")),
      painReported: data.get("pain") === "on",
      unusualFatigue: data.get("fatigue") === "on"
    });
    const adjustment = applyAdjustment(runner.weeklyKm, review);
    const entry = {
      id: `review-${Date.now()}`, ...review, adjustment, activityCount: recent.length,
      planId: activePlan.id, planVersion: activePlan.version ?? 1,
      plannedWeek: completedWeek.week.week, periodStart: completedWeek.startDate, periodEnd: completedWeek.endDate
    };
    state.adjustments = [entry, ...state.adjustments].slice(0,100);
    if (review.decision === "pause") {
      runner.hasConcerningSymptoms = true;
      state.runners = [runner];
      if (state.plans[0]) {
        state.plans[0].status = "paused";
        state.plans[0].warnings = [...(state.plans[0].warnings ?? []), "Piano sospeso dopo la segnalazione di dolore o sintomi preoccupanti. Non riprendere automaticamente: chiedi una valutazione professionale appropriata."];
        renderPlan(state.plans[0]);
      }
      message.textContent = `Settimana ${completedWeek.week.week} (${completedWeek.startDate} – ${completedWeek.endDate}), pianificati ${completedWeek.week.targetKm} km, registrati ${review.completedKm} km. Piano sospeso. Non è stata applicata alcuna progressione; chiedi una valutazione professionale appropriata prima di riprendere.`;
    } else if (review.decision === "reduce" || review.decision === "progress") {
      const nextRunner = {...runner, weeklyKm: adjustment.weeklyKm, hasConcerningSymptoms: false};
      const nextPlan = generatePlan(nextRunner, {today:today(), id:`plan-${Date.now()}`});
      nextPlan.version = (state.plans[0]?.version ?? 0) + 1;
      nextPlan.adjustmentReason = review.reasons.join(" ");
      state.runners = [nextRunner];
      state.plans = [nextPlan, ...state.plans].slice(0,10);
      renderPlan(nextPlan);
      message.textContent = `Settimana ${completedWeek.week.week} (${completedWeek.startDate} – ${completedWeek.endDate}), pianificati ${completedWeek.week.targetKm} km, registrati ${review.completedKm} km. Esito: ${review.decision}. Carico settimanale aggiornato da ${runner.weeklyKm} a ${adjustment.weeklyKm} km. Il piano è stato rigenerato; le sedute saltate non sono state recuperate.`;
    } else {
      message.textContent = `Settimana ${completedWeek.week.week} (${completedWeek.startDate} – ${completedWeek.endDate}), pianificati ${completedWeek.week.targetKm} km, registrati ${review.completedKm} km. Esito: mantenere. ${review.reasons.join(" ")} Carico invariato: ${runner.weeklyKm} km/settimana.`;
    }
    persist();
    message.hidden = false;
  } catch (e) {
    message.textContent = e.message;
    message.hidden = false;
  }
});
function restoreProfile() {
  const runner = state.runners[0]; if (!runner) return;
  const form = $("#profile-form");
  for (const key of ["level","raceDate","weeklyKm","longestRunKm","daysAvailable"]) if (runner[key] != null) form.elements[key].value = runner[key];
  if (runner.recentPaceSecPerKm) form.elements.recentPace.value = `${Math.floor(runner.recentPaceSecPerKm/60)}:${String(runner.recentPaceSecPerKm%60).padStart(2,"0")}`;
  form.elements.symptoms.checked = Boolean(runner.hasConcerningSymptoms);
  if (state.plans[0]) renderPlan(state.plans[0]);
}
restoreProfile(); renderHistory();
