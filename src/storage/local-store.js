const STORAGE_KEY = "running-planner:v2";
const EMPTY = () => ({ profile: null, plan: null, workouts: [], feedback: [], dismissed: [], tests: [], savedAt: 0 });
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const num = v => v == null || (typeof v === "number" && Number.isFinite(v));
const obj = v => v && typeof v === "object" && !Array.isArray(v);

// Lo stato può arrivare da un'altra versione, da un altro dispositivo o essere corrotto:
// si tiene solo ciò che l'interfaccia sa leggere senza rompersi.
export function validPlan(plan) {
  if (!obj(plan) || !ISO.test(plan.startDate) || !ISO.test(plan.raceDate) || !Number.isFinite(plan.racePaceSec)) return false;
  if (!Array.isArray(plan.weeks) || !plan.weeks.length) return false;
  return plan.weeks.every(w => obj(w) && Array.isArray(w.days) && w.days.length === 7 && Number.isFinite(w.km) && w.days.every(d =>
    obj(d) && ISO.test(d.date) && Number.isInteger(d.dayIndex) &&
    (d.session == null || (obj(d.session) && typeof d.session.kind === "string" && Array.isArray(d.session.steps) && d.session.steps.length > 0 && d.session.steps.every(s =>
      obj(s) && ((s.k === "run" && typeof s.code === "string" && Number.isFinite(s.km)) ||
                 (s.k === "reps" && Number.isFinite(s.n) && Number.isFinite(s.workKm) && Number.isFinite(s.recSec) && typeof s.workCode === "string" && typeof s.recCode === "string")))))));
}
const validWorkout = w => obj(w) && typeof w.id === "string" && ISO.test(w.date) && num(w.distanceKm) && num(w.durationSec) && num(w.rpe) && (w.distanceKm != null || w.durationSec != null);
const validTest = t => obj(t) && typeof t.id === "string" && ["base30", "tt5k"].includes(t.type) && ISO.test(t.date) && num(t.distanceKm) && num(t.durationSec) && num(t.rpe) && (t.type === "base30" ? t.distanceKm > 0 : t.durationSec > 0);
const validFeedback = f => obj(f) && ISO.test(f.date) && typeof f.planId === "string" && typeof f.completion === "string" && num(f.plannedKm) && num(f.actualKm) && num(f.durationSec) && num(f.rpe);

export function sanitize(parsed) {
  const p = obj(parsed) ? parsed : {};
  const plan = validPlan(p.plan) ? { ...p.plan, adjustments: Array.isArray(p.plan.adjustments) ? p.plan.adjustments.filter(a => obj(a) && typeof a.id === "string" && typeof a.fromDate === "string") : [] } : null;
  return {
    profile: obj(p.profile) ? p.profile : null,
    plan,
    workouts: Array.isArray(p.workouts) ? p.workouts.filter(validWorkout) : [],
    feedback: Array.isArray(p.feedback) ? p.feedback.filter(validFeedback) : [],
    dismissed: Array.isArray(p.dismissed) ? p.dismissed.filter(x => typeof x === "string") : [],
    tests: Array.isArray(p.tests) ? p.tests.filter(validTest) : [],
    savedAt: Number.isFinite(p.savedAt) ? p.savedAt : 0
  };
}

export function createLocalStore(storage = globalThis.localStorage) {
  return {
    read() {
      if (!storage) return EMPTY();
      try { return sanitize(JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}")); } catch { return EMPTY(); }
    },
    write(state) {
      if (!storage) throw new Error("Archivio del browser non disponibile.");
      const safe = sanitize(state);
      storage.setItem(STORAGE_KEY, JSON.stringify(safe));
      return safe;
    },
    clear() { storage?.removeItem(STORAGE_KEY); }
  };
}
