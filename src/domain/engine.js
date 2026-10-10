import { DECISIONS, validateRunner } from "./models.js";

const round1 = n => Math.round(n * 10) / 10;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const DAY = 86400000;

export function classifyTrainingContext(runner) {
  const validation = validateRunner(runner);
  if (!validation.ok) throw new TypeError(validation.errors.join(" "));
  const loadBand = runner.weeklyKm < 15 || runner.longestRunKm < 8 ? "low"
    : runner.weeklyKm < 35 || runner.longestRunKm < 18 ? "building" : "established";
  return { ability: runner.level, loadBand, phase: "base" };
}

export function phaseForWeek(week, totalWeeks) {
  if (!Number.isInteger(week) || !Number.isInteger(totalWeeks) || totalWeeks < 1 || week < 1 || week > totalWeeks) {
    throw new RangeError("week must be within totalWeeks.");
  }
  if (totalWeeks < 10) return week === totalWeeks ? "taper" : "base";
  if (week > totalWeeks - 2) return "taper";
  const fraction = week / totalWeeks;
  if (fraction <= 0.3) return "base";
  if (fraction <= 0.62) return "build";
  return "specific";
}

function workout(type, km, effort, note = "") {
  return { type, distanceKm: round1(Math.max(0, km)), effort, note };
}

function splitSessions({ targetKm, longKm, days, context, phase, recovery, runner }) {
  if (days === 1) return [workout(context.loadBand === "low" ? "run_walk" : "easy", targetKm, "conversational", "One available day: keep the session easy; this schedule is not enough frequency for a typical marathon build.")];
  const qualityAllowed = context.loadBand === "established" && runner.level !== "beginner" && !recovery && days >= 4 && targetKm >= 30;
  const type = context.loadBand === "low" ? "run_walk" : "easy";
  const count = Math.max(1, Math.min(days - 1, qualityAllowed ? 3 : days - 1));
  const easyKm = round1(Math.max(0, targetKm - longKm));
  const distances = [];
  for (let i = 0; i < count; i++) distances.push(round1(easyKm / count));
  // Keep rounding drift in the last easy session, so session distances match the weekly target.
  if (distances.length) distances[distances.length - 1] = round1(Math.max(0, easyKm - distances.slice(0, -1).reduce((a, b) => a + b, 0)));
  const sessions = distances.map((km, i) => workout(type, km, "conversational"));
  if (qualityAllowed && (phase === "build" || phase === "specific")) {
    const idx = sessions.length > 1 ? 1 : 0;
    sessions[idx] = workout(
      phase === "specific" && runner.level === "advanced" ? "marathon_pace" : runner.level === "advanced" ? "intervals" : "threshold",
      sessions[idx].distanceKm,
      "controlled; never all-out",
      "Only retain this session if healthy and already accustomed to quality training; otherwise run easy."
    );
  }
  sessions.push(workout("long", longKm, "easy; conversational", recovery ? "Recovery long run; shorten further if fatigued." : ""));
  return sessions.slice(0, days);
}

export function generatePlan(runner, options = {}) {
  const validation = validateRunner(runner);
  if (!validation.ok) throw new TypeError(validation.errors.join(" "));
  if (runner.hasConcerningSymptoms) throw new Error("Plan generation paused: concerning symptoms must be addressed before training progression.");
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const todayMs = Date.parse(today), raceMs = Date.parse(runner.raceDate);
  if (!Number.isFinite(todayMs) || !Number.isFinite(raceMs) || raceMs <= todayMs) throw new RangeError("Race date must be in the future.");
  const daysUntilRace = Math.floor((raceMs - todayMs) / DAY);
  const weeksToRace = Math.floor(daysUntilRace / 7);
  if (weeksToRace < 1) throw new RangeError("Race date must be at least one week in the future.");
  const context = classifyTrainingContext(runner);
  const totalWeeks = Math.min(weeksToRace, 52);
  const warnings = [];
  if (weeksToRace < 10) warnings.push("Less than 10 weeks remain. This prototype cannot establish whether a safe marathon build is feasible; consider a qualified coach and/or a later race.");
  if (weeksToRace > 52) warnings.push("The race is more than a year away. This plan covers the next 52 weeks only; regenerate it later rather than treating it as a fixed year-long prescription.");
  if (context.loadBand === "low") warnings.push("Current sustainable running load is low. This is a conservative base plan, not a promise of marathon readiness.");
  if (runner.daysAvailable < 3) warnings.push("Fewer than 3 running days per week are available; a typical marathon preparation may not be feasible with this schedule.");
  const weeks = [];
  let previousKm = runner.weeklyKm;
  for (let i = 1; i <= totalWeeks; i++) {
    const phase = phaseForWeek(i, totalWeeks);
    const recovery = i % 4 === 0 && phase !== "taper";
    const lastTarget = weeks[weeks.length - 1]?.targetKm ?? previousKm;
    const baseTarget = i === 1
      ? Math.max(previousKm, Math.min(previousKm + 1, Math.max(previousKm, runner.longestRunKm * 2)))
      : recovery ? lastTarget * 0.78
      : Math.min(lastTarget + Math.max(0.5, lastTarget * 0.05), Math.max(runner.weeklyKm * 1.45, runner.weeklyKm + 8));
    let targetKm = round1(Math.max(0, baseTarget));
    if (phase === "taper") {
      const taperFactor = i === totalWeeks ? 0.55 : 0.75;
      targetKm = round1(Math.min(targetKm, Math.max(0, lastTarget * taperFactor)));
    }
    const longCap = context.loadBand === "low" ? 0.36 : context.loadBand === "building" ? 0.38 : 0.4;
    const longKm = round1(Math.min(runner.longestRunKm + (recovery || phase === "taper" ? 0 : 1), targetKm * longCap, targetKm));
    const sessions = splitSessions({ targetKm, longKm, days: runner.daysAvailable, context, phase, recovery, runner });
    const actualKm = round1(sessions.reduce((sum, s) => sum + s.distanceKm, 0));
    weeks.push({
      week: i, phase, recovery, targetKm: actualKm, sessions,
      guidance: recovery ? "Recovery week: keep all sessions easy and reduce further if fatigue persists."
        : phase === "taper" ? "Taper: reduce volume, avoid catch-up sessions, and prioritize sleep and recovery."
        : phase === "specific" ? "Specific phase: quality is optional and only for runners already tolerating structured work."
        : "Keep easy running conversational; use run/walk as needed."
    });
    previousKm = actualKm;
  }
  return {
    id: options.id ?? `plan-${Date.now()}`, version: 1, generatedAt: new Date().toISOString(),
    startDate: today, raceDate: runner.raceDate, level: runner.level, context, totalWeeks,
    weeks, warnings,
    disclaimer: "Prototype training guidance, not medical advice or a validated marathon prescription. Stop for concerning symptoms and seek qualified advice. Race readiness is not guaranteed."
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
  } else if (plannedKm > 0 && completedKm >= plannedKm * 0.85 && completedWorkouts.length > 0 && completedWorkouts.every(w => w.rpe == null || w.rpe <= 6)) {
    decision = "progress";
    reasons.push("Planned volume was largely completed at controlled perceived effort; consider only the next small planned step.");
  } else {
    reasons.push("Evidence does not justify progression; maintain the current load.");
  }
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
