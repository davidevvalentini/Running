import { DECISIONS, LEVELS, validateRunner } from "./models.js";

const round1 = n => Math.round(n * 10) / 10;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function classifyTrainingContext(runner) {
  const validation = validateRunner(runner);
  if (!validation.ok) throw new TypeError(validation.errors.join(" "));
  // Ability and sustainable load remain separate: a returning advanced runner may need a beginner-like base.
  const loadBand = runner.weeklyKm < 15 || runner.longestRunKm < 8 ? "low"
    : runner.weeklyKm < 35 || runner.longestRunKm < 18 ? "building" : "established";
  const phase = loadBand === "low" ? "base" : "base";
  return { ability: runner.level, loadBand, phase };
}

function workout(type, km, effort, note = "") {
  return { type, distanceKm: round1(Math.max(0, km)), effort, note };
}

export function generatePlan(runner, options = {}) {
  const validation = validateRunner(runner);
  if (!validation.ok) throw new TypeError(validation.errors.join(" "));
  if (runner.hasConcerningSymptoms) throw new Error("Plan generation paused: concerning symptoms must be addressed before training progression.");
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const weeksToRace = Math.floor((Date.parse(runner.raceDate) - Date.parse(today)) / (7 * 86400000));
  if (weeksToRace < 1) throw new RangeError("Race date must be at least one week in the future.");
  const context = classifyTrainingContext(runner);
  const buildWeeks = Math.min(weeksToRace, 16);
  const maxDays = runner.daysAvailable;
  const initial = Math.max(0, runner.weeklyKm);
  const weeks = [];
  let previousKm = initial;

  for (let i = 0; i < buildWeeks; i++) {
    const recovery = (i + 1) % 4 === 0;
    // Conservative, capped progression; a recovery week reduces load. No universal percentage rule.
    const target = i === 0 ? Math.max(initial, Math.min(12, Math.max(5, runner.longestRunKm * 2.2)))
      : recovery ? previousKm * 0.78
      : Math.min(previousKm + Math.max(1, previousKm * 0.06), Math.max(initial * 1.5, 10));
    const safeTarget = round1(Math.max(0, target));
    const longShare = context.loadBand === "low" ? 0.32 : context.loadBand === "building" ? 0.34 : 0.36;
    const longKm = round1(Math.min(runner.longestRunKm + (recovery ? 0 : 1), safeTarget * longShare));
    const sessions = [];
    if (maxDays >= 1) sessions.push(workout(context.loadBand === "low" ? "run_walk" : "easy", round1(safeTarget * 0.25), "conversational"));
    if (maxDays >= 2) sessions.push(workout("easy", round1(safeTarget * 0.25), "conversational"));
    if (maxDays >= 3) sessions.push(workout("easy", round1(Math.max(0, safeTarget - longKm - sessions.reduce((s, x) => s + x.distanceKm, 0))), "conversational"));
    if (maxDays >= 2) sessions.push(workout("long", longKm, "easy; conversational"));
    // Quality is allowed only with an established current load, not just an advanced label.
    if (context.loadBand === "established" && runner.level !== "beginner" && !recovery && maxDays >= 4 && safeTarget >= 25) {
      sessions.push(workout(runner.level === "advanced" ? "intervals" : "threshold", round1(Math.min(6, safeTarget * 0.15)), "controlled; never all-out", "Quality session only if healthy and accustomed to structured training."));
    }
    weeks.push({
      week: i + 1, recovery, targetKm: safeTarget, sessions: sessions.slice(0, maxDays),
      guidance: recovery ? "Recovery week: keep all running easy." : "Keep easy sessions conversational; use run/walk as needed."
    });
    previousKm = safeTarget;
  }
  return {
    id: options.id ?? `plan-${Date.now()}`, version: 1, generatedAt: new Date().toISOString(),
    raceDate: runner.raceDate, level: runner.level, context, weeks,
    disclaimer: "Training guidance only; not medical advice. Stop for concerning symptoms and seek qualified advice."
  };
}

export function reviewTrainingWeek({ runner, plannedKm, completedWorkouts, missedSessions = 0, painReported = false, unusualFatigue = false }) {
  const validation = validateRunner(runner);
  if (!validation.ok) throw new TypeError(validation.errors.join(" "));
  if (!Number.isFinite(plannedKm) || plannedKm < 0) throw new TypeError("plannedKm must be a non-negative number.");
  if (!Array.isArray(completedWorkouts)) throw new TypeError("completedWorkouts must be an array.");
  const completedKm = completedWorkouts.reduce((sum, item) => sum + (Number.isFinite(item.distanceKm) && item.distanceKm > 0 ? item.distanceKm : 0), 0);
  let decision = "maintain";
  const reasons = [];
  if (painReported || runner.hasConcerningSymptoms) {
    decision = "pause";
    reasons.push("Pain or concerning symptoms reported: progression is blocked; seek appropriate professional assessment.");
  } else if (unusualFatigue) {
    decision = "reduce";
    reasons.push("Unusual fatigue reported: reduce load and prioritize recovery.");
  } else if (missedSessions > 0) {
    decision = "maintain";
    reasons.push("Missed sessions are not added to future weeks; resume the plan without catch-up mileage.");
  } else if (plannedKm > 0 && completedKm < plannedKm * 0.7) {
    decision = "reduce";
    reasons.push("Completed volume was substantially below plan; repeat or reduce the load rather than progressing.");
  } else if (plannedKm > 0 && completedKm >= plannedKm * 0.85 && completedWorkouts.every(w => w.rpe == null || w.rpe <= 6)) {
    decision = "progress";
    reasons.push("Planned volume was largely completed at controlled perceived effort; consider only the next small planned step.");
  } else {
    reasons.push("Evidence does not justify progression; maintain the current load.");
  }
  if (!DECISIONS.includes(decision)) throw new Error("Internal decision invariant failed.");
  return { decision, plannedKm: round1(plannedKm), completedKm: round1(completedKm), missedSessions, reasons, reviewedAt: new Date().toISOString() };
}

export function applyAdjustment(currentWeeklyKm, review) {
  if (!Number.isFinite(currentWeeklyKm) || currentWeeklyKm < 0) throw new TypeError("currentWeeklyKm must be non-negative.");
  if (!review || !DECISIONS.includes(review.decision)) throw new TypeError("Invalid review decision.");
  if (review.decision === "pause") return { weeklyKm: 0, status: "paused" };
  if (review.decision === "reduce") return { weeklyKm: round1(currentWeeklyKm * 0.8), status: "active" };
  if (review.decision === "progress") return { weeklyKm: round1(currentWeeklyKm + clamp(currentWeeklyKm * 0.05, 0, 2)), status: "active" };
  return { weeklyKm: round1(currentWeeklyKm), status: "active" };
}
