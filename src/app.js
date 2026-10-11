import { generatePlan, planSummary, requiredAbilities, recommendedDays, assessFeasibility, addDays, DISTANCES, wdShort } from "./domain/plan.js";
import { fmtDuration, fmtGoal, fmtKm, fmtPace, PACE_NAMES } from "./domain/paces.js";
import { expandSteps, notation } from "./domain/session.js";
import { applyAdjustment, effectiveSession, locate, moveSession, moveTargets, nextSession, proposeFromFeedback, proposeFromWeek, weekAdherence } from "./domain/adapt.js";
import { fetchWeather, hrZones, weatherAdvice, weeklyLoad } from "./domain/extras.js";
import { TEST_DEFS, evaluateBase, evaluateGoal, latestTest, levelSummary, proposeFromTests } from "./domain/assessment.js";
import { encodeWorkoutFit } from "./import/fit.js";
import { createWorkout } from "./domain/models.js";
import { createLocalStore } from "./storage/local-store.js";
import { previewActivities } from "./import/activities.js";
import { previewFit } from "./import/fit.js";

const store = createLocalStore();
let state = store.read();
let currentPreview = null;
const $ = s => document.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => { const n = new Date(); return new Date(n.getTime() - n.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const fmtDate = iso => { const [, m, d] = iso.split("-"); return `${d}/${m}`; };
const KIND = { easy: "Facile", quality: "Qualità", long: "Lungo", race: "Gara" };
const PHASE = { base: "Base", build: "Sviluppo", specific: "Specifica", taper: "Tapering" };
let pushTimer = null;
const persist = () => {
  state.savedAt = Date.now();
  try { state = store.write(state); } catch (e) { console.warn(e); }
  clearTimeout(pushTimer); pushTimer = setTimeout(pushRemote, 600);
};

/* ---------- sincronizzazione col server (se disponibile) ---------- */
const REMOTE = "/api/running-state";
async function pushRemote() {
  if (!embedded) return;
  try { await fetch(REMOTE, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(state) }); } catch { /* solo locale */ }
}
async function pullRemote() {
  if (!embedded) return;
  try {
    const res = await fetch(REMOTE, { headers: { accept: "application/json" } });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return;
    const remote = await res.json();
    if (remote && remote.savedAt > (state.savedAt ?? 0)) { state = store.write(remote); restoreProfile(); renderAll(); route(); }
    else if (state.savedAt > (remote?.savedAt ?? 0)) pushRemote();
  } catch { /* solo locale */ }
}

/* ---------- tema e incorniciatura (Second Brain) ---------- */
const embedded = (() => { try { return window.self !== window.top; } catch { return true; } })();
if (embedded) document.documentElement.classList.add("embed");
function applyTheme() {
  let dark;
  try { dark = embedded ? parent.document.documentElement.classList.contains("dark") : matchMedia("(prefers-color-scheme: dark)").matches; }
  catch { dark = matchMedia("(prefers-color-scheme: dark)").matches; }
  document.documentElement.classList.toggle("dark", dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0d1117" : "#f6f4ef");
}
applyTheme();
try { if (embedded) new MutationObserver(applyTheme).observe(parent.document.documentElement, { attributes: true, attributeFilter: ["class"] }); } catch { /* altra origine */ }
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applyTheme);

/* ---------- parsing ---------- */
function parseTime(value, { min, max, what, twoParts = "ms" }) {
  const v = value.trim();
  if (!v) return null;
  const parts = v.split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some(p => !/^\d+$/.test(p))) throw new Error(`${what}: usa il formato h:mm, mm:ss oppure h:mm:ss.`);
  const n = parts.map(Number);
  if (n.slice(1).some(x => x > 59)) throw new Error(`${what}: minuti e secondi devono essere sotto 60.`);
  const sec = n.length === 3 ? n[0] * 3600 + n[1] * 60 + n[2] : twoParts === "hm" ? n[0] * 3600 + n[1] * 60 : n[0] * 60 + n[1];
  if (sec < min || sec > max) throw new Error(`${what} fuori dall'intervallo accettato.`);
  return sec;
}

/* ---------- pezzi di UI ---------- */
const RUN_NAMES = { RIS: "Riscaldamento", DEF: "Defaticamento", "Z2-CLR": "Corsa lenta rigenerante", CL: "Corsa lenta", LQ: "Lungo di qualità", CM: "Corsa media", CV: "Corsa veloce", RG: "Ritmo gara", GARA: "Gara" };
function stepRows(eff) {
  return eff.steps.map(step => {
    if (step.k === "run") {
      const cls = step.code === "RIS" ? "warm" : step.code === "DEF" ? "rec" : "work";
      return `<div class="step ${cls}"><div><strong>${esc(RUN_NAMES[step.code] ?? step.code)}</strong><br><small>${esc(step.code)} · ${fmtKm(step.km)} km</small></div><b>${fmtPace(eff.paces[step.code])}/km</b></div>`;
    }
    return `<div class="step work"><div><strong>${step.n} × ${fmtKm(step.workKm)} km</strong> <small>${esc(step.workCode)}</small><br><small>recupero ${fmtDuration(step.recSec)} · ${esc(step.recCode)} a ${fmtPace(eff.paces[step.recCode])}/km</small></div><b>${fmtPace(eff.paces[step.workCode])}/km</b></div>`;
  }).join("");
}
function sessionBlock(eff) {
  const hasReps = eff.steps.some(s => s.k === "reps");
  return `<div class="notation">${esc(notation(eff.steps))}</div>
    <div class="stats"><div class="stat"><span>Distanza</span><strong>${fmtKm(eff.km)} km</strong></div><div class="stat"><span>Durata</span><strong>${fmtDuration(eff.sec)}</strong></div><div class="stat"><span>Media</span><strong>${fmtPace(eff.avgPaceSec)}</strong></div></div>
    <div class="steps">${stepRows(eff)}</div>
    ${hasReps ? `<details class="fold" style="margin-top:12px"><summary>Dettaglio di tutte le ripetute</summary><div class="fold-body steps">${expandSteps(eff.steps, eff.paces).map(s => `<div class="step ${s.title.startsWith("Ripetuta") ? "work" : "rec"}"><div>${esc(s.title)}<br><small>${esc(s.detail)}</small></div><b>${fmtDuration(s.sec)}</b></div>`).join("")}</div></details>` : ""}`;
}
function proposalCards(list) {
  return list.map(p => `<div class="proposal"><h3>${esc(p.title)}</h3><p>${esc(p.reason)}</p><div class="actions"><button class="btn small" data-accept="${esc(p.id)}" type="button">${p.kind === "pause" ? "Sospendi il piano" : "Applica"}</button>${p.kind === "pause" ? "" : `<button class="btn small secondary" data-dismiss="${esc(p.id)}" type="button">Ignora</button>`}</div></div>`).join("");
}
function currentProposals() {
  const plan = state.plan;
  if (!plan || plan.status === "paused") return [];
  const feedback = [...state.feedback].sort((a, b) => b.date.localeCompare(a.date));
  const testProps = state.profile ? proposeFromTests({ plan, goalSec: plan.goalTimeSec, distance: plan.distance ?? "marathon", tests: state.tests, paces: planSummary(plan).paces, today: today(), dismissed: state.dismissed }) : [];
  return [...testProps, ...proposeFromFeedback({ plan, feedback, today: today(), dismissed: state.dismissed }), ...proposeFromWeek({ plan, workouts: state.workouts, today: today(), dismissed: state.dismissed })];
}
function sessionActions(day, eff) {
  const plan = state.plan, targets = day.date >= today() ? moveTargets(plan, day.date, today()) : [];
  const sel = targets.length ? `<select data-move-from="${esc(day.date)}" aria-label="Sposta la seduta"><option value="">Sposta a…</option>${targets.map(d => `<option value="${esc(d.date)}">${wdShort(d.date)} ${fmtDate(d.date)}${d.session ? " (scambia)" : ""}</option>`).join("")}</select>` : "";
  return `<div class="actions-row"><button class="btn small secondary" data-fit="${esc(day.date)}" type="button">Scarica .FIT</button>${sel}</div>`;
}
const planLabel = plan => plan.distanceLabel ?? "Maratona";
let weather = null; // { city, day, data }
async function loadWeather() {
  const city = state.profile?.city; if (!city) return;
  if (weather?.city === city && weather.day === today()) return;
  weather = { city, day: today(), data: null };
  try { weather.data = await fetchWeather(city); } catch (e) { weather.error = e.message; }
  renderOggi();
}
function weatherCard() {
  const city = state.profile?.city; if (!city || !weather || weather.city !== city) return "";
  if (weather.error) return `<div class="card"><p class="note">Meteo non disponibile per “${esc(city)}”: ${esc(weather.error)}</p></div>`;
  const d = weather.data?.days.find(x => x.date === today()); if (!d) return "";
  const adv = weatherAdvice(d);
  return `<div class="card"><div class="row-between"><h2>Meteo · ${esc(weather.data.place)}</h2><span class="chip">${Math.round(d.tempMin)}° / ${Math.round(d.tempMax)}°</span></div><p class="note">Pioggia ${Math.round(d.rainProb)}% · vento fino a ${Math.round(d.windMax)} km/h.</p>${adv.notes.length ? adv.notes.map(n => `<p class="note">${esc(n)}</p>`).join("") : '<p class="note">Condizioni buone per correre.</p>'}</div>`;
}
/* ---------- test iniziali ---------- */
function testResultLine(t) {
  return t.type === "base30" ? `${fmtKm(t.distanceKm)} km in 30' (${fmtPace(1800 / t.distanceKm)}/km)${t.rpe ? ` · RPE ${t.rpe}` : ""}` : `${fmtDuration(t.durationSec)} sui 5 km (${fmtPace(t.durationSec / 5)}/km)${t.rpe ? ` · RPE ${t.rpe}` : ""}`;
}
function testForm(def) {
  const fields = def.id === "base30"
    ? `<label>${esc(def.field)}<input type="number" inputmode="decimal" name="distanceKm" min="1" max="12" step="0.01" required placeholder="es. 4.5"></label>`
    : `<div class="time-set"><label>minuti<input type="number" inputmode="numeric" name="min" min="10" max="60" step="1" required placeholder="25"></label><label>secondi<input type="number" inputmode="numeric" name="sec" min="0" max="59" step="1" placeholder="00"></label></div>`;
  return `<form class="form test-form" data-test="${def.id}" style="margin-top:10px">${fields}
    <div class="grid2"><label>Data<input type="date" name="date" value="${today()}" required></label>
    <label>Sforzo percepito (RPE)<select name="rpe"><option value="">—</option>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<option>${n}</option>`).join("")}</select></label></div>
    <button class="btn small" type="submit">Salva il test</button><p class="note err test-error" role="alert" hidden></p></form>`;
}
function testsCard({ compact = false } = {}) {
  const plan = state.plan; if (!plan) return "";
  const done = TEST_DEFS.map(d => latestTest(state.tests, d.id));
  const rows = TEST_DEFS.map((def, i) => `<div class="card" style="padding:12px;background:var(--surface2)"><div class="row-between"><strong>${esc(def.title)}</strong>${done[i] ? '<span class="badge easy">fatto</span>' : '<span class="badge">da fare</span>'}</div>
    <p class="note">${esc(def.why)}</p>
    ${done[i] ? `<p class="note"><strong>${esc(testResultLine(done[i]))}</strong> · ${fmtDate(done[i].date)} <button class="link" data-undo-test="${esc(done[i].id)}" type="button">Rifai</button></p>`
      : `<details class="fold" ${compact ? "" : "open"}><summary>Come si fa</summary><div class="fold-body"><ol class="how">${def.how.map(h => `<li>${esc(h)}</li>`).join("")}</ol>${testForm(def)}</div></details>`}</div>`).join("");
  const goalEval = evaluateGoal({ goalSec: plan.goalTimeSec, distance: plan.distance ?? "marathon", tests: state.tests });
  const baseEval = evaluateBase({ z2PaceSec: planSummary(plan).paces["Z2-CLR"], tests: state.tests });
  let evalHtml = "";
  if (goalEval || baseEval) {
    const pr = goalEval?.predictions;
    evalHtml = `<div class="card" style="padding:12px;margin-top:10px;border-color:var(--accent)"><div class="row-between"><strong>Valutazione iniziale</strong>${goalEval ? `<span class="verdict ${goalEval.verdict === "fuori portata" ? "fuori" : goalEval.verdict}">${esc(goalEval.verdict)}</span>` : ""}</div>
      <p class="note">${esc(levelSummary({ goalEval, baseEval }))}.</p>
      ${pr ? `<div class="kv" style="margin-top:8px"><div><span>10 km</span><strong>${fmtDuration(pr["10k"])}</strong></div><div><span>Mezza</span><strong>${fmtDuration(pr.half)}</strong></div><div><span>Maratona</span><strong>${fmtGoal(pr.marathon)}</strong></div><div><span>VMA</span><strong>${pr.vma} km/h</strong></div></div><p class="note">Stime dal test sui 5 km (Riegel con margine di fatica sulle distanze lunghe): indicative, non garantite.</p>` : ""}
      ${[...(goalEval?.notes ?? []), ...(baseEval?.notes ?? [])].map(n => `<p class="note">${esc(n)}</p>`).join("")}</div>`;
  }
  return `<div class="card"><h2>Test iniziali</h2><p class="note">Prima di partire, due test stabiliscono il tuo livello e il passo gara realistico. Si fanno nei primi giorni, a sensazione, riposato.</p><div class="test-grid" style="margin-top:12px">${rows}</div>${evalHtml}</div>`;
}
// La scheda dei test resta in "Oggi" per le prime due settimane (poi vive in Progressi), anche a test completati, per mostrare la valutazione.
const needsTests = () => { const plan = state.plan; return Boolean(plan) && today() <= addDays(plan.startDate, 13); };
const EXTRA = { kind: "extra", title: "Corsa fuori programma", km: 0, sec: 0, avgPaceSec: 0 };
const doneKm = date => state.workouts.filter(w => w.date === date).reduce((s, w) => s + (w.distanceKm ?? 0), 0);

/* ---------- OGGI ---------- */
function renderOggi() {
  const el = $("#view-oggi"), plan = state.plan, t = today();
  if (!plan) { el.innerHTML = `<div class="card"><h2>Benvenuto</h2><p class="note">Nessun piano attivo. Imposta data della gara e tempo obiettivo nel profilo: il piano settimanale arriva con ritmi, ripetute e lunghi calcolati sul tuo obiettivo.</p><p><button class="btn" data-goto="profilo" type="button">Crea il piano</button></p></div>`; return; }
  const loc = locate(plan, t);
  let html = "";
  if (plan.status === "paused") html += `<div class="warn">Piano sospeso per dolore o sintomi segnalati. Chiedi una valutazione professionale prima di riprendere. <button class="link" data-resume type="button">Riprendi il piano</button></div>`;
  html += proposalCards(currentProposals());
  html += weatherCard();
  if (needsTests()) html += testsCard({ compact: true });
  if (loc.state === "before") {
    const n = nextSession(plan, t) ?? { day: plan.weeks[0].days.find(d => d.session) };
    const first = plan.weeks[0].days.find(d => d.session), eff = effectiveSession(plan, first);
    html += `<div class="card"><h2>Il piano inizia tra ${loc.daysToStart} ${loc.daysToStart === 1 ? "giorno" : "giorni"}</h2><p class="note">Prima seduta: ${esc(wdShort(first.date))} ${fmtDate(first.date)}.</p><h3 class="session-title">${esc(eff.title)}</h3>${sessionBlock(eff)}</div><div class="card"><h2>Hai già corso?</h2><p class="note">Il piano non è ancora iniziato, ma puoi registrare lo stesso un allenamento: servirà a valutare la tua base.</p><p><button class="btn secondary" data-goto="progressi" type="button">Registra un allenamento</button></p></div>`;
    void n;
  } else if (loc.state === "after") {
    html += `<div class="card"><h2>Piano concluso</h2><p class="note">Il periodo del piano è terminato. Nel profilo puoi crearne uno nuovo per il prossimo obiettivo.</p></div>`;
  } else {
    const { week, day } = loc, eff = effectiveSession(plan, day);
    if (eff) {
      const fb = state.feedback.find(f => f.date === t && f.planId === plan.id);
      html += `<div class="card"><div class="today-head"><span><span class="badge ${esc(eff.kind)}">${KIND[eff.kind]}</span> ${eff.adjusted ? '<span class="badge">adattata</span>' : ""}</span><span>Oggi, ${esc(wdShort(day.date))} ${fmtDate(t)} · Settimana ${week.week}/${plan.totalWeeks} · ${PHASE[week.phase]}</span></div><h3 class="session-title">${esc(eff.title)}</h3>${eff.note ? `<p class="note">${esc(eff.note)}</p>` : ""}${sessionBlock(eff)}${sessionActions(day, eff)}${eff.rpe && eff.rpe !== "—" ? `<p class="note">Sforzo atteso: RPE ${esc(eff.rpe)}/10. Se il corpo dice altro, il ritmo cede il passo allo sforzo.</p>` : ""}</div>`;
      html += feedbackCard(fb, eff);
    } else {
      const nxt = nextSession(plan, t);
      html += `<div class="card"><div class="today-head"><span><span class="badge">Riposo</span></span><span>Oggi, ${esc(wdShort(day.date))} ${fmtDate(t)} · Settimana ${week.week}/${plan.totalWeeks}</span></div><h3 class="session-title">Oggi si recupera</h3><p class="note">Rispetta il giorno di riposo: è lì che si assimila l'allenamento. Una seduta saltata non va mai recuperata.</p></div>`;
      html += feedbackCard(state.feedback.find(f => f.date === t && f.planId === plan.id), EXTRA, "Hai corso comunque?");
      if (nxt) { const e2 = effectiveSession(plan, nxt.day); html += `<div class="card"><div class="today-head"><span><span class="badge ${esc(e2.kind)}">${KIND[e2.kind]}</span></span><span>Prossima: ${esc(wdShort(nxt.day.date))} ${fmtDate(nxt.day.date)}</span></div><h3 class="session-title">${esc(e2.title)}</h3>${sessionBlock(e2)}</div>`; }
    }
    html += `<div class="card"><h2>Questa settimana</h2><p class="note">${esc(week.name)} — ${esc(week.text)}</p><div class="weekstrip" style="margin-top:12px">${week.days.map(d => {
      const e = effectiveSession(plan, d), done = e && doneKm(d.date) > 0;
      return `<div class="wd ${d.date === t ? "today" : ""} ${done ? "done" : ""} ${e ? "" : "restday"}"><b>${wdShort(d.date)}</b>${e ? `<span class="km">${fmtKm(e.km)}</span><span class="dot ${esc(e.kind)}"></span>` : `<span class="km">—</span>`}</div>`;
    }).join("")}</div></div>`;
  }
  el.innerHTML = html;
}
function feedbackCard(fb, eff, title = "Com'è andata davvero?") {
  if (fb) return `<div class="card"><h2>Registrato</h2><p class="note">${fb.completion === "skipped" ? "Seduta non svolta." : `Hai corso ${fb.actualKm != null ? fmtKm(fb.actualKm) + " km" : "—"}${fb.durationSec ? " in " + fmtDuration(fb.durationSec) : ""}${fb.rpe ? ", RPE " + fb.rpe : ""}.`}${fb.advice ? " " + esc(fb.advice) : ""}</p><button class="link" data-undo-feedback type="button">Modifica</button></div>`;
  return `<div class="card"><h2>${esc(title)}</h2><p class="note">Il tuo riscontro serve ad adattare il piano: ti proporrò correzioni, senza cambiare nulla finché non confermi.</p>
    <form id="daily-form" class="form" style="margin-top:12px"><div class="grid2">
      <label>Esito<select name="completion"><option value="completed">Completata</option><option value="modified">Svolta in modo diverso</option><option value="skipped">Non svolta</option></select></label>
      <label>Distanza (km)<input type="number" name="distanceKm" min="0.1" max="300" step="0.01" placeholder="${eff.km ? String(eff.km) : "es. 8"}"></label>
      <label>Durata (minuti)<input type="number" name="durationMin" min="1" max="2880" step="0.1" placeholder="${eff.sec ? Math.round(eff.sec / 60) : "es. 50"}"></label>
      <label>Sforzo percepito (RPE)<select name="rpe"><option value="">—</option>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<option>${n}</option>`).join("")}</select></label></div>
      <label>Note su sensazioni e recupero<textarea name="notes" rows="2" maxlength="2000" placeholder="Gambe, respiro, sonno, caldo…"></textarea></label>
      <label class="check"><input type="checkbox" name="fatigue"><span>Fatica insolita o recupero insufficiente</span></label>
      <label class="check"><input type="checkbox" name="pain"><span>Dolore o sintomi preoccupanti</span></label>
      <button class="btn" type="submit">Registra e valuta</button><p id="daily-message" class="note err" role="alert" hidden></p></form></div>`;
}
function submitDaily(form) {
  const msg = $("#daily-message"); msg.hidden = true;
  try {
    const plan = state.plan, t = today(), loc = locate(plan, t);
    const day = loc?.state === "in" ? loc.day : null, eff = day && (effectiveSession(plan, day) ?? EXTRA);
    if (!eff) throw new Error("Il piano non è ancora iniziato: usa \"Registra un allenamento\" in Progressi.");
    const data = new FormData(form), completion = String(data.get("completion"));
    const km = String(data.get("distanceKm")).trim(), min = String(data.get("durationMin")).trim(), rpe = String(data.get("rpe")).trim();
    if (completion !== "skipped" && !km && !min) throw new Error("Inserisci almeno distanza o durata.");
    const pain = data.get("pain") === "on", fatigue = data.get("fatigue") === "on";
    state.workouts = state.workouts.filter(w => !(w.source === "seduta" && w.date === t));
    let workout = null;
    if (completion !== "skipped") {
      workout = createWorkout({ date: t, distanceKm: km ? Number(km) : null, durationSec: min ? Math.round(Number(min) * 60) : null, rpe: rpe ? Number(rpe) : null, notes: String(data.get("notes") ?? ""), source: "seduta", externalId: `seduta:${t}` });
      state.workouts.push(workout);
    }
    state.feedback = [{ id: `fb-${Date.now()}`, date: t, planId: plan.id, kind: eff.kind, title: eff.title, plannedKm: eff.km, plannedAvgPaceSec: eff.avgPaceSec || null, completion, actualKm: workout?.distanceKm ?? null, durationSec: workout?.durationSec ?? null, rpe: workout?.rpe ?? null, fatigue, pain, notes: String(data.get("notes") ?? "") }, ...state.feedback.filter(f => f.date !== t)].slice(0, 200);
    if (pain) state.plan = { ...plan, status: "paused" };
    const hasProposal = !pain && proposeFromFeedback({ plan: state.plan, feedback: state.feedback, today: t, dismissed: state.dismissed }).length > 0;
    state.feedback[0].advice = pain ? "Piano sospeso: chiedi una valutazione professionale." : hasProposal ? "Ho una proposta di correzione qui sopra." : "Nessuna correzione necessaria: prosegui col piano.";
    persist(); renderAll();
  } catch (e) { msg.textContent = e.message; msg.hidden = false; }
}

/* ---------- PIANO ---------- */
const ZONES = [
  ["Zona 2", "Z2-CLR, CL", "73–80% FC max", "3–4", "Base aerobica, efficienza, resistenza generale."],
  ["Zona 3", "LQ, CM", "80–87% FC max", "4–6", "Resistenza aerobica intensa, economia di corsa, preparazione al ritmo gara."],
  ["Zona 4", "CV, RipLL, RipL", "87–93% FC max", "7–8", "Soglia: potenza aerobica e tolleranza al lattato."],
  ["Zona 5", "RipM, RipB", "93–100% FC max", "8–9", "VO2max e velocità."]
];
function feasibilityNow(plan) {
  const t = latestTest(state.tests, "tt5k"), p = state.profile;
  if (!p) return plan.feasibility;
  const asRecent = !p.recentRaceTimeSec && t ? { recentRaceDistanceKm: 5, recentRaceTimeSec: t.durationSec } : {};
  return assessFeasibility({ ...p, goalTimeSec: plan.goalTimeSec, ...asRecent }, null, plan.distanceKm ?? 42.195);
}
function renderPiano() {
  const el = $("#view-piano"), plan = state.plan;
  if (!plan) { el.innerHTML = `<div class="empty">Nessun piano. Creane uno dal profilo.</div>`; return; }
  const s = planSummary(plan), t = today(), loc = locate(plan, t), curWeek = loc?.state === "in" ? loc.week.week : 0;
  const maxKm = Math.max(...plan.weeks.map(w => w.km));
  const req = requiredAbilities(plan.goalTimeSec, plan.distanceKm ?? 42.195), feas = feasibilityNow(plan), zones = hrZones(state.profile?.maxHr);
  const race = new Date(`${plan.raceDate}T00:00:00Z`).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  let html = `<div class="card"><h2>Riepilogo del piano</h2><div class="kv" style="margin-top:12px">
    <div><span>${esc(planLabel(plan))}</span><strong>${esc(race)}</strong></div><div><span>Obiettivo</span><strong>${esc(fmtGoal(plan.goalTimeSec))}</strong></div><div><span>Ritmo gara</span><strong>${fmtPace(s.paces.GARA)}/km</strong></div><div><span>Durata</span><strong>${plan.totalWeeks} settimane</strong></div>
    <div><span>Allenamenti</span><strong>${plan.daysPerWeek} / settimana</strong></div><div><span>Km totali</span><strong>${fmtKm(s.totalKm)}</strong></div><div><span>Media</span><strong>${fmtKm(s.avgKm)} km</strong></div><div><span>Picco</span><strong>S${s.peakWeek} · ${fmtKm(s.peakKm)} km</strong></div></div>
    <div class="bars" aria-label="Chilometri per settimana">${plan.weeks.map(w => `<div class="bar ${w.recovery ? "recovery" : w.phase === "taper" ? "taper" : ""} ${w.week === curWeek ? "cur" : ""}" style="height:${Math.max(4, Math.round(w.km / maxKm * 100))}%" title="Settimana ${w.week}: ${fmtKm(w.km)} km"></div>`).join("")}</div>
    <div class="bar-labels">${plan.weeks.map(w => `<span>${w.week}</span>`).join("")}</div>
    ${plan.warnings.map(w => `<div class="warn" style="margin-top:10px">${esc(w)}</div>`).join("")}
    ${plan.adjustments?.length ? `<p class="note">Adattamenti applicati: ${plan.adjustments.map(a => esc(a.title)).join(" · ")}.</p>` : ""}</div>`;
  html += `<div class="card"><h2>Capacità richieste per ${esc(fmtGoal(plan.goalTimeSec))}</h2><div class="kv" style="margin-top:12px"><div><span>VMA stimata</span><strong>${req.vma} km/h</strong></div><div><span>5 km</span><strong>${fmtDuration(req.t5)}</strong></div><div><span>10 km</span><strong>${fmtDuration(req.t10)}</strong></div><div><span>Mezza</span><strong>${fmtDuration(req.half)}</strong></div></div>
    <p class="note"><strong>Probabilità di successo: ${esc(feas.level)}.</strong> ${feas.notes.map(esc).join(" ")}</p><p class="note">Valori equivalenti (formula di Riegel) a titolo indicativo, non un test fisiologico.</p></div>`;
  html += `<div class="card"><details class="fold"><summary>Ritmi e zone di allenamento</summary><div class="fold-body"><div class="legend">${["GARA", "Z2-CLR", "LQ", "RIS", "CL", "CM", "CV", "RG", "RipB", "REC_B", "RipM", "REC_M", "RipL", "REC_L", "RipLL", "REC_LL", "DEF"].map(c => `<div><span title="${esc(PACE_NAMES[c] ?? "Ritmo gara")}">${esc(c === "GARA" ? "Gara" : c)}</span><b>${fmtPace(s.paces[c])}</b></div>`).join("")}</div>
    <div class="scroll" style="margin-top:12px"><table class="table"><thead><tr><th>Zona</th><th>Sedute</th><th>FC</th><th>RPE</th><th>Scopo</th></tr></thead><tbody>${ZONES.map((z, i) => `<tr>${z.map((c, j) => `<td>${esc(j === 2 && zones ? `${zones[i].low}–${zones[i].high} bpm (${c})` : c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
    <p class="note">80/20: l'80% dei km è facile, il 20% è qualità. Il lungo non supera ~3 ore di corsa: oltre, il rischio infortuni cresce più dei benefici. Riscaldamento (RIS) e defaticamento (DEF) fanno parte della seduta; i recuperi tra le ripetute si corrono, non si camminano.</p></div></details></div>`;
  html += plan.weeks.map(w => `<details class="week ${w.week === curWeek ? "current" : ""}" ${w.week === curWeek || (!curWeek && w.week === 1) ? "open" : ""}><summary><span class="wn">S${w.week}</span><span><span class="wt">${esc(w.name)}</span><br><span class="ws">${esc(PHASE[w.phase])}${w.recovery ? " · scarico" : ""} · ${fmtDate(w.days[0].date)}–${fmtDate(w.days[6].date)}</span></span><span class="wk">${fmtKm(w.km)} km</span></summary>
      <div class="week-body"><p>${esc(w.text)}</p>${w.days.map(d => {
        const e = effectiveSession(plan, d), done = doneKm(d.date);
        return `<div class="day ${d.date === t ? "today" : ""}"><div class="dn">${wdShort(d.date)}<small>${fmtDate(d.date)}</small></div><div>${e ? `<span class="badge ${esc(e.kind)}">${KIND[e.kind]}</span> <strong>${esc(e.title)}</strong>${e.adjusted ? ' <span class="badge">adattata</span>' : ""} ${done ? `<span class="ok">✓ ${fmtKm(done)} km</span>` : ""}<div class="notation" style="margin-top:6px">${esc(notation(e.steps))}</div><div class="tot">Tot: ${fmtKm(e.km)} km in ${fmtDuration(e.sec)} · media ${fmtPace(e.avgPaceSec)}/km</div>${d.date >= t ? sessionActions(d, e) : ""}` : `<span class="muted">Riposo</span>`}</div></div>`;
      }).join("")}</div></details>`).join("");
  el.innerHTML = html;
}

/* ---------- PROGRESSI ---------- */
function renderProgressi() {
  const plan = state.plan, t = today();
  let html = proposalCards(currentProposals());
  if (plan) html += testsCard({ compact: true });
  if (plan) {
    const loc = locate(plan, t), upto = loc.state === "in" ? loc.weekIndex : loc.state === "after" ? plan.weeks.length - 1 : -1;
    html += `<div class="card"><h2>Aderenza settimanale</h2>${upto < 0 ? '<p class="note">Il piano non è ancora iniziato.</p>' : plan.weeks.slice(0, upto + 1).map((w, i) => {
      const a = weekAdherence(plan, i, state.workouts), pct = Math.min(100, Math.round(a.ratio * 100));
      return `<div class="prog-row"><b>S${w.week}</b><div class="meter"><i class="${a.ratio < 0.7 && i < upto ? "low" : ""}" style="width:${pct}%"></i></div><span>${fmtKm(a.done)} / ${fmtKm(a.planned)} km</span></div>`;
    }).join("")}</div>`;
    const loads = plan.weeks.slice(0, Math.max(0, upto) + 1).map(w => weeklyLoad(state.workouts, w.days[0].date, w.days[6].date));
    const maxLoad = Math.max(1, ...loads.map(l => l.load));
    html += upto < 0 ? "" : `<div class="card"><h2>Carico di allenamento</h2><p class="note">Minuti × sforzo percepito (RPE) per settimana: serve a vedere i picchi. Conta solo chi ha durata e RPE.</p>${loads.map((l, i) => `<div class="prog-row"><b>S${i + 1}</b><div class="meter"><i style="width:${Math.round(l.load / maxLoad * 100)}%"></i></div><span>${l.load || "—"}</span></div>`).join("")}</div>`;
    const fbs = [...state.feedback].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
    html += `<div class="card"><h2>Riscontri recenti</h2><div class="list">${fbs.length ? fbs.map(f => `<div class="item"><span>${fmtDate(f.date)}</span><div><strong>${esc(f.title)}</strong><br><small>${f.completion === "skipped" ? "non svolta" : `${f.actualKm != null ? fmtKm(f.actualKm) + " km" : ""}${f.durationSec ? " · " + fmtDuration(f.durationSec) : ""}${f.rpe ? " · RPE " + f.rpe : ""}`}${f.fatigue ? " · fatica" : ""}${f.pain ? " · dolore" : ""}</small></div><small>previsti ${fmtKm(f.plannedKm)} km</small></div>`).join("") : '<div class="empty">I riscontri della scheda "Oggi" compariranno qui.</div>'}</div></div>`;
  }
  $("#progress-content").innerHTML = html;
  const workouts = [...state.workouts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  $("#workout-history").innerHTML = workouts.length ? workouts.map(w => `<div class="item"><span>${fmtDate(w.date)}</span><div><strong>${w.distanceKm != null ? fmtKm(w.distanceKm) + " km" : "—"}</strong><br><small>${w.durationSec ? fmtDuration(w.durationSec) : ""}${w.rpe ? " · RPE " + w.rpe : ""} · ${esc(w.source)}</small></div><button class="link" data-remove="${esc(w.id)}" type="button">Elimina</button></div>`).join("") : '<div class="empty">Gli allenamenti registrati appariranno qui.</div>';
}

/* ---------- PROFILO ---------- */
const nv = (f, n) => { const v = f.elements[n].value; return v === "" ? 0 : Number(v); };
const setHMS = (f, prefix, sec, parts) => {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), x = sec % 60;
  if (parts.includes("h")) f.elements[`${prefix}H`].value = h || "";
  if (parts.includes("m")) f.elements[`${prefix}M`].value = parts.includes("h") ? String(m).padStart(2, "0") : String(Math.floor(sec / 60));
  if (parts.includes("s")) f.elements[`${prefix}S`].value = String(x).padStart(2, "0");
};
// Obiettivo: ore+minuti per maratona e mezza, minuti+secondi per i 10 km.
const goalParts = dist => (dist === "10k" ? ["m", "s"] : ["h", "m"]);
function readGoalSec(f) {
  const tenk = f.elements.distance.value === "10k";
  return tenk ? nv(f, "goalM") * 60 + nv(f, "goalS") : nv(f, "goalH") * 3600 + nv(f, "goalM") * 60;
}
function readRaceSec(f) {
  const sec = nv(f, "raceH") * 3600 + nv(f, "raceM") * 60 + nv(f, "raceS");
  return sec > 0 ? sec : null;
}
function restoreProfile() {
  const p = state.profile, f = $("#profile-form");
  if (!p) return;
  f.elements.raceDate.value = p.raceDate;
  f.elements.distance.value = p.distance ?? "marathon"; syncGoalLabel();
  setHMS(f, "goal", p.goalTimeSec, goalParts(p.distance ?? "marathon"));
  f.elements.maxHr.value = p.maxHr ?? ""; f.elements.city.value = p.city ?? "";
  f.elements.daysAvailable.value = String(p.daysAvailable); f.elements.daysAvailable.dataset.touched = "1";
  f.elements.recentRaceDistance.value = p.recentRaceDistanceKm ? String(p.recentRaceDistanceKm) : "";
  if (p.recentRaceTimeSec) setHMS(f, "race", p.recentRaceTimeSec, ["h", "m", "s"]);
  f.elements.symptoms.checked = Boolean(p.hasConcerningSymptoms);
}
function syncGoalLabel() {
  const f = $("#profile-form"), dist = f.elements.distance.value, parts = goalParts(dist);
  $("#goal-label").textContent = dist === "10k" ? "Tempo obiettivo (minuti e secondi)" : "Tempo obiettivo (ore e minuti)";
  for (const label of f.querySelectorAll("#goal-label ~ label")) label.hidden = !parts.includes(label.dataset.part);
  f.elements.goalH.placeholder = dist === "half" ? "2" : "4";
  f.elements.goalM.placeholder = dist === "10k" ? "55" : "00";
}
function suggestDays() {
  const f = $("#profile-form"), dist = f.elements.distance.value, cfg = DISTANCES[dist], goal = readGoalSec(f);
  if (!(goal >= cfg.minGoal && goal <= cfg.maxGoal)) { $("#days-label").textContent = "Giorni di corsa a settimana"; return; }
  const rec = recommendedDays(dist, goal);
  $("#days-label").textContent = `Giorni di corsa a settimana (consigliati: ${rec})`;
  if (!f.elements.daysAvailable.dataset.touched) f.elements.daysAvailable.value = String(rec);
}
$("#profile-form").elements.daysAvailable.addEventListener("change", e => { e.target.dataset.touched = "1"; });
$("#profile-form").elements.distance.addEventListener("change", () => { syncGoalLabel(); suggestDays(); });
for (const n of ["goalH", "goalM", "goalS"]) $("#profile-form").elements[n].addEventListener("input", suggestDays);
$("#profile-form").addEventListener("submit", e => {
  e.preventDefault();
  const f = e.currentTarget, err = $("#profile-error"); err.hidden = true; err.className = "note err";
  try {
    const dist = f.elements.distance.value, cfg = DISTANCES[dist];
    const goal = readGoalSec(f);
    if (!goal) throw new Error(dist === "10k" ? "Inserisci il tempo obiettivo (minuti e secondi)." : "Inserisci il tempo obiettivo (ore e minuti).");
    const raceTime = readRaceSec(f);
    const profile = {
      distance: dist, maxHr: f.elements.maxHr.value ? Number(f.elements.maxHr.value) : null, city: f.elements.city.value.trim() || null,
      raceDate: f.elements.raceDate.value, goalTimeSec: goal, daysAvailable: Number(f.elements.daysAvailable.value),
      recentRaceDistanceKm: f.elements.recentRaceDistance.value ? Number(f.elements.recentRaceDistance.value) : null,
      recentRaceTimeSec: raceTime, hasConcerningSymptoms: f.elements.symptoms.checked
    };
    if (profile.recentRaceDistanceKm && !raceTime) throw new Error("Indica anche il tempo della gara recente.");
    if (!profile.recentRaceDistanceKm && raceTime) throw new Error("Indica anche la distanza della gara recente.");
    const core = x => JSON.stringify([x?.distance ?? "marathon", x?.raceDate, x?.goalTimeSec, x?.daysAvailable, x?.recentRaceDistanceKm ?? null, x?.recentRaceTimeSec ?? null, Boolean(x?.hasConcerningSymptoms)]);
    if (state.plan && state.profile && core(state.profile) === core(profile)) {
      state.profile = profile; persist(); renderAll(); restoreProfile();
      err.textContent = "Preferenze salvate (il piano non è cambiato)."; err.className = "note ok"; err.hidden = false; return;
    }
    err.className = "note err";
    if (state.plan && !confirm("Esiste già un piano. Sostituirlo? Allenamenti e riscontri registrati restano, gli adattamenti accettati no.")) return;
    const plan = generatePlan(profile, { today: today() });
    state.profile = profile; state.plan = plan; state.dismissed = []; persist();
    location.hash = "#oggi"; renderAll(); route();
  } catch (error) { err.textContent = error.message; err.hidden = false; }
});

/* ---------- eventi ---------- */
document.addEventListener("click", e => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.goto) { location.hash = `#${t.dataset.goto}`; return; }
  if (t.dataset.accept != null) {
    const p = currentProposals().find(x => x.id === t.dataset.accept); if (!p) return;
    if (p.kind === "goal") {
      try {
        const profile = { ...state.profile, goalTimeSec: p.newGoalSec, hasConcerningSymptoms: false };
        state.plan = generatePlan(profile, { today: today() }); state.profile = profile; restoreProfile();
      } catch (error) { alert(error.message); return; }
    } else state.plan = p.kind === "pause" ? { ...state.plan, status: "paused" } : applyAdjustment(state.plan, p, today());
    persist(); return renderAll();
  }
  if (t.dataset.dismiss != null) { state.dismissed.push(t.dataset.dismiss); persist(); return renderAll(); }
  if (t.hasAttribute("data-resume")) { if (confirm("Riprendere il piano? Fallo solo se un professionista ha escluso problemi.")) { state.plan = { ...state.plan, status: "active" }; persist(); renderAll(); } return; }
  if (t.hasAttribute("data-undo-feedback")) { const d = today(); state.feedback = state.feedback.filter(f => f.date !== d); state.workouts = state.workouts.filter(w => !(w.source === "seduta" && w.date === d)); persist(); return renderAll(); }
  if (t.dataset.remove) { state.workouts = state.workouts.filter(w => w.id !== t.dataset.remove); persist(); renderAll(); }
});
document.addEventListener("click", e => {
  const b = e.target.closest("button[data-fit]"); if (!b) return;
  const loc = locate(state.plan, b.dataset.fit), eff = loc?.state === "in" && effectiveSession(state.plan, loc.day);
  if (!eff) return;
  const bytes = encodeWorkoutFit({ name: eff.title.slice(0, 15), steps: eff.steps, paces: eff.paces });
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
  const a = document.createElement("a"); a.href = url; a.download = `seduta-${b.dataset.fit}.fit`; a.click(); URL.revokeObjectURL(url);
});
document.addEventListener("change", e => {
  const sel = e.target.closest("select[data-move-from]"); if (!sel || !sel.value) return;
  try {
    const { plan, warning } = moveSession(state.plan, sel.dataset.moveFrom, sel.value, today());
    state.plan = plan; persist(); renderAll();
    if (warning) alert(warning);
  } catch (error) { alert(error.message); sel.value = ""; }
});
document.addEventListener("submit", e => {
  const form = e.target.closest(".test-form"); if (!form) return;
  e.preventDefault();
  const err = form.querySelector(".test-error"); err.hidden = true;
  try {
    const type = form.dataset.test, data = new FormData(form), rpe = String(data.get("rpe")) ? Number(data.get("rpe")) : null;
    const test = { id: `test-${Date.now()}`, type, date: String(data.get("date")), rpe, distanceKm: null, durationSec: null };
    if (type === "base30") { test.distanceKm = Number(data.get("distanceKm")); if (!(test.distanceKm >= 1 && test.distanceKm <= 12)) throw new Error("Distanza non plausibile per 30 minuti (1–12 km)."); }
    else { test.durationSec = Number(data.get("min")) * 60 + Number(data.get("sec") || 0); if (!(test.durationSec >= 600 && test.durationSec <= 3600)) throw new Error("Tempo sui 5 km non plausibile (tra 10 e 60 minuti)."); }
    state.tests = [...state.tests.filter(t => t.type !== type), test]; persist(); renderAll();
  } catch (error) { err.textContent = error.message; err.hidden = false; }
});
document.addEventListener("click", e => {
  const b = e.target.closest("button[data-undo-test]"); if (!b) return;
  state.tests = state.tests.filter(t => t.id !== b.dataset.undoTest); persist(); renderAll();
});
document.addEventListener("submit", e => { if (e.target.id === "daily-form") { e.preventDefault(); submitDaily(e.target); } });
document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => { location.hash = `#${b.dataset.tab}`; }));
const TABS = ["oggi", "piano", "progressi", "profilo"];
function route() {
  let tab = location.hash.slice(1);
  if (!TABS.includes(tab)) tab = state.plan ? "oggi" : "profilo";
  for (const id of TABS) $(`#view-${id}`).hidden = id !== tab;
  document.querySelectorAll(".tab").forEach(b => { const on = b.dataset.tab === tab; b.classList.toggle("on", on); b.setAttribute("aria-selected", String(on)); });
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);

$("#activity-form").elements.date.value = today();
$("#activity-form").addEventListener("submit", e => {
  e.preventDefault();
  const f = e.currentTarget, d = new FormData(f), m = $("#activity-message");
  try {
    state.workouts.push(createWorkout({ date: String(d.get("date")), distanceKm: Number(d.get("distanceKm")), durationSec: d.get("durationMin") ? Math.round(Number(d.get("durationMin")) * 60) : null, rpe: d.get("rpe") ? Number(d.get("rpe")) : null, notes: String(d.get("notes") ?? ""), source: "manuale" }));
    persist(); f.reset(); f.elements.date.value = today(); m.textContent = "Allenamento salvato."; m.className = "note ok"; m.hidden = false; renderAll();
  } catch (error) { m.textContent = error.message; m.className = "note err"; m.hidden = false; }
});
$("#activity-file").addEventListener("change", async e => {
  const file = e.target.files?.[0]; if (!file) return;
  const box = $("#import-preview"); box.hidden = false; currentPreview = null;
  try {
    const ext = file.name.split(".").pop().toLowerCase();
    currentPreview = ext === "fit"
      ? previewFit({ name: file.name, size: file.size, buffer: await file.arrayBuffer() })
      : previewActivities({ name: file.name, size: file.size, text: await file.text(), format: ext });
    box.innerHTML = `<div class="card" style="margin-top:12px"><strong>Anteprima: ${currentPreview.count} attività</strong><p class="note">${esc(currentPreview.warnings[0])}</p>${currentPreview.activities.slice(0, 8).map(w => `<div class="item"><span>${fmtDate(w.date)}</span><div>${w.distanceKm != null ? fmtKm(w.distanceKm) + " km" : ""}${w.durationSec ? " · " + Math.round(w.durationSec / 60) + " min" : ""}</div><span></span></div>`).join("")}<p><button id="confirm-import" class="btn secondary small" type="button">Conferma importazione</button></p></div>`;
  } catch (error) { box.innerHTML = `<div class="warn">${esc(error.message)}</div>`; }
});
$("#import-preview").addEventListener("click", e => {
  if (e.target.id !== "confirm-import" || !currentPreview) return;
  let added = 0, dup = 0;
  for (const item of currentPreview.activities) {
    if (item.externalId && state.workouts.some(w => w.source === item.source && w.externalId === item.externalId)) { dup++; continue; }
    state.workouts.push(createWorkout({ ...item, id: undefined })); added++;
  }
  persist(); $("#import-preview").innerHTML = `<p class="note ok">Importazione: ${added} aggiunte, ${dup} duplicati ignorati.</p>`; currentPreview = null; $("#activity-file").value = ""; renderAll();
});
function exportData() {
  const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = "running-export.json"; a.click(); URL.revokeObjectURL(url);
}
$("#export-button").addEventListener("click", exportData);
$("#export-profile").addEventListener("click", exportData);

/* ---------- reset ---------- */
function resetAll() {
  state = { profile: null, plan: null, workouts: [], feedback: [], dismissed: [], tests: [], savedAt: Date.now() };
  try { state = store.write(state); } catch (e) { console.warn(e); }
  clearTimeout(pushTimer); pushRemote(); // il server tiene la versione più recente: anche gli altri dispositivi si azzerano
  weather = null; currentPreview = null;
  const f = $("#profile-form"); f.reset(); delete f.elements.daysAvailable.dataset.touched; syncGoalLabel(); suggestDays();
  $("#activity-form").reset(); $("#activity-form").elements.date.value = today(); $("#import-preview").hidden = true;
  $("#profile-error").hidden = true;
  renderAll(); location.hash = "#profilo"; route();
  const msg = $("#reset-message"); msg.textContent = "Tutto azzerato. Puoi creare un nuovo piano."; msg.hidden = false;
}
$("#reset-start").addEventListener("click", () => { $("#reset-confirm").hidden = false; $("#reset-start").hidden = true; });
$("#reset-no").addEventListener("click", () => { $("#reset-confirm").hidden = true; $("#reset-start").hidden = false; });
$("#reset-yes").addEventListener("click", () => { $("#reset-confirm").hidden = true; $("#reset-start").hidden = false; resetAll(); });

function renderAll() {
  const chip = $("#countdown");
  if (state.plan) { const d = Math.round((Date.parse(`${state.plan.raceDate}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 86400000); chip.textContent = d > 0 ? `Gara tra ${d} giorni` : d === 0 ? "Oggi è il giorno!" : "Gara conclusa"; chip.hidden = false; } else chip.hidden = true;
  $("#disclaimer").textContent = state.plan?.disclaimer ?? "";
  renderOggi(); renderPiano(); renderProgressi(); loadWeather();
}
restoreProfile(); renderAll(); route(); pullRemote();
