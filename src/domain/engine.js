import { DECISIONS, isValidISODate, validateRunner } from "./models.js";

const round1 = n => Math.round(n * 10) / 10;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const DAY = 86400000;

const paceLabel = seconds => {
  const value = Math.max(0, Math.round(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}/km`;
};

export function estimatePaceZones(runner) {
  if (!runner || !Number.isFinite(runner.recentRaceDistanceKm) || !Number.isFinite(runner.recentRaceTimeSec)) return null;
  const distance = runner.recentRaceDistanceKm, raceTime = runner.recentRaceTimeSec;
  if (![5, 10, 21.0975].includes(distance) || raceTime < 600 || raceTime > 8 * 3600) return null;
  const marathonSeconds = raceTime * Math.pow(42.195 / distance, 1.06) / 42.195;
  const tenKmPace = raceTime * Math.pow(10 / distance, 1.06) / 10;
  const easy = { low: marathonSeconds + 30, high: marathonSeconds + 75 };
  const threshold = { low: tenKmPace + 10, high: tenKmPace + 25 };
  const intervals = { low: Math.max(150, tenKmPace - 15), high: Math.max(150, tenKmPace - 5) };
  const band = z => `${paceLabel(z.low)} – ${paceLabel(z.high)}`;
  return {
    sourceDistanceKm: distance, sourceTimeSec: raceTime,
    marathon: { low: marathonSeconds, high: marathonSeconds },
    easy, threshold, intervals,
    labels: { marathon: paceLabel(marathonSeconds), easy: band(easy), threshold: band(threshold), intervals: band(intervals) },
    disclaimer: "Stime indicative da una singola prestazione, non soglie fisiologiche misurate. Il ritmo maratona previsto può essere troppo ambizioso senza una base di resistenza specifica."
  };
}

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

const DAY_NAMES = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];
const TRAINING_DAYS = {
  1: [6], 2: [2, 6], 3: [1, 3, 6], 4: [1, 3, 5, 6],
  5: [0, 1, 3, 5, 6], 6: [0, 1, 2, 4, 5, 6], 7: [0, 1, 2, 3, 4, 5, 6]
};

function sessionStructure(type, km, paceZones = null, options = {}) {
  const total = round1(Math.max(0, km));
  if (type === "long") {
    return {
      warmupKm: 0,
      mainKm: total,
      cooldownKm: 0,
      mainSet: options.longFinish
        ? `Lungo progressivo controllato: primi ${round1(total * 0.8)} km facili (RPE 3–4/10), ultimi ${round1(total * 0.2)} km al massimo a ritmo regolare moderato (RPE 5/10), solo se stai bene. Non è una prova a ritmo gara; se sei affaticato, mantieni tutto facile.`
        : `Corri tutto il lungo a intensità facile e conversazionale (RPE 3–4/10)${paceZones ? `; riferimento indicativo ${paceZones.labels.easy} min/km, ma prevale il test della conversazione` : ""}. Parti piano; se la tecnica o la sensazione peggiorano, accorcia la seduta.`
    };
  }
  if (type === "easy" || type === "run_walk") {
    const warmupKm = total >= 4 ? 0.5 : 0;
    const cooldownKm = total >= 5 ? 0.5 : 0;
    return {
      warmupKm,
      mainKm: round1(Math.max(0, total - warmupKm - cooldownKm)),
      cooldownKm,
      mainSet: type === "run_walk"
        ? "Alterna corsa molto facile e camminata (ad esempio 3 min + 1 min); ripeti senza forzare e termina sentendoti in controllo."
        : `Ritmo facile, RPE 3–4/10: devi riuscire a parlare per frasi complete${paceZones ? `; riferimento indicativo ${paceZones.labels.easy} min/km` : ""}. Nessun finale veloce.`
    };
  }
  const warmupKm = round1(total * 0.2);
  const cooldownKm = round1(total * 0.2);
  const mainKm = round1(Math.max(0, total - warmupKm - cooldownKm));
  let mainSet;
  if (type === "intervals") {
    const reps = Math.min(8, Math.floor((mainKm + 0.2) / 0.6));
    mainSet = reps >= 2
      ? `Parte centrale: ${reps} × 400 m sostenuti ma controllati (RPE 7/10)${paceZones ? `; riferimento indicativo ${paceZones.labels.intervals} min/km` : ""}, con 200 m di corsa molto facile tra le prove. Il chilometraggio residuo della parte centrale è facile; niente sprint.`
      : "Distanza insufficiente per una serie di ripetute completa: trasforma la seduta in corsa facile, senza comprimere riscaldamento o defaticamento.";
  } else if (type === "threshold") {
    const reps = Math.min(4, Math.floor((mainKm + 0.4) / 1.4));
    mainSet = reps >= 1
      ? `Parte centrale: ${reps} × 1 km a soglia controllata (RPE 6/10)${paceZones ? `; riferimento indicativo ${paceZones.labels.threshold} min/km` : ""}, con 400 m di corsa facile dopo ogni prova tranne l'ultima. Il chilometraggio residuo è facile.`
      : "La seduta è troppo breve per ripetute di soglia con recupero adeguato: svolgi la parte centrale a ritmo facile e non forzare.";
  } else {
    mainSet = paceZones
      ? `Parte centrale a ritmo maratona ${paceZones.labels.targetMarathon ?? paceZones.labels.marathon} min/km ${paceZones.labels.targetMarathon ? "come obiettivo da verificare gradualmente, non da forzare" : "stimato"}; se il ritmo non è sostenibile, rallenta o corri facile. ${paceZones.labels.targetMarathon ? "Il ritmo obiettivo non dimostra che il tempo gara sia raggiungibile." : "Stima teorica da gara recente, da validare in allenamento."}`
      : "Parte centrale a ritmo maratona solo se il ritmo obiettivo deriva da una gara recente o da una valutazione attendibile; altrimenti svolgila a ritmo facile (RPE 3–4/10). Non inseguire un ritmo ipotetico.";
  }
  return { warmupKm, mainKm, cooldownKm, mainSet };
}

function workout(type, km, effort, note = "", paceZones = null, structureOptions = {}) {
  const distanceKm = round1(Math.max(0, km));
  return { type, distanceKm, effort, note, structure: sessionStructure(type, distanceKm, paceZones, structureOptions) };
}

function assignSessionDays(sessions, days) {
  const schedule = TRAINING_DAYS[days] ?? TRAINING_DAYS[4];
  return sessions.map((session, index) => ({ ...session, day: DAY_NAMES[schedule[index] ?? schedule[schedule.length - 1]] }));
}

function splitSessions({ targetKm, longKm, days, context, phase, recovery, runner, paceZones }) {
  if (days === 1) {
    // Never compress the whole weekly target into one outing. With one running day,
    // cap the session at the most recent longest run and report the resulting volume.
    const cappedKm = Math.min(targetKm, runner.weeklyKm, runner.longestRunKm);
    return [workout(
      context.loadBand === "low" ? "run_walk" : "easy",
      cappedKm,
      "conversational",
      "One available day: session capped at the recent longest run, not the weekly target. This schedule is not enough frequency for a typical marathon build."
    )];
  }
  const qualityAllowed = context.loadBand === "established" && runner.level !== "beginner" && !recovery && days >= 4 && targetKm >= 30;
  const type = context.loadBand === "low" ? "run_walk" : "easy";
  const count = Math.max(1, Math.min(days - 1, qualityAllowed ? 3 : days - 1));
  const easyKm = round1(Math.max(0, targetKm - longKm));
  const distances = [];
  for (let i = 0; i < count; i++) distances.push(round1(easyKm / count));
  // Keep rounding drift in the last easy session, so session distances match the weekly target.
  if (distances.length) distances[distances.length - 1] = round1(Math.max(0, easyKm - distances.slice(0, -1).reduce((a, b) => a + b, 0)));
  const sessions = distances.map((km, i) => workout(type, km, "conversational", "", paceZones));
  if (qualityAllowed && (phase === "build" || phase === "specific")) {
    const idx = sessions.length > 1 ? 1 : 0;
    const qualityType = phase === "specific" && runner.level === "advanced" ? "marathon_pace" : runner.level === "advanced" ? "intervals" : "threshold";
    sessions[idx] = workout(
      qualityType,
      sessions[idx].distanceKm,
      "controlled; never all-out",
      "Only retain this session if healthy and already accustomed to quality training; otherwise run easy.",
      paceZones
    );
  }
  const longFinish = context.loadBand === "established" && phase === "specific" && !recovery && longKm >= 18;
  sessions.push(workout("long", longKm, "easy; conversational", recovery ? "Recovery long run; shorten further if fatigued." : longFinish ? "Specific long run: only a controlled finish, never all-out." : "", paceZones, { longFinish }));
  return sessions.slice(0, days);
}


export function getLatestCompletedPlanWeek(plan, today) {
  if (!plan || typeof plan !== "object" || !Array.isArray(plan.weeks) ||
      !isValidISODate(plan.startDate) || !isValidISODate(today)) {
    throw new TypeError("A plan with a valid startDate and a valid review date is required.");
  }
  const startMs = Date.parse(`${plan.startDate}T00:00:00Z`);
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  const elapsedDays = Math.floor((todayMs - startMs) / DAY);
  if (elapsedDays < 7) return null;
  const weekIndex = Math.floor(elapsedDays / 7) - 1;
  if (weekIndex < 0 || weekIndex >= plan.weeks.length) return null;
  const dateAtOffset = offset => new Date(startMs + offset * DAY).toISOString().slice(0, 10);
  return {
    week: plan.weeks[weekIndex],
    weekIndex,
    startDate: dateAtOffset(weekIndex * 7),
    endDate: dateAtOffset(weekIndex * 7 + 6)
  };
}

export function generatePlan(runner, options = {}) {
  const validation = validateRunner(runner);
  if (!validation.ok) throw new TypeError(validation.errors.join(" "));
  if (runner.hasConcerningSymptoms) throw new Error("Plan generation paused: concerning symptoms must be addressed before training progression.");
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  if (!isValidISODate(today) || !isValidISODate(runner.raceDate)) throw new RangeError("Today and race date must be real calendar dates in YYYY-MM-DD format.");
  const todayMs = Date.parse(`${today}T00:00:00Z`), raceMs = Date.parse(`${runner.raceDate}T00:00:00Z`);
  if (!Number.isFinite(todayMs) || !Number.isFinite(raceMs) || raceMs <= todayMs) throw new RangeError("Race date must be in the future.");
  const daysUntilRace = Math.floor((raceMs - todayMs) / DAY);
  const weeksToRace = Math.floor(daysUntilRace / 7);
  if (weeksToRace < 1) throw new RangeError("Race date must be at least one week in the future.");
  const context = classifyTrainingContext(runner);
  const paceZones = estimatePaceZones(runner);
  const targetMarathonPaceSecPerKm = runner.goalMarathonTimeSec ? runner.goalMarathonTimeSec / 42.195 : null;
  const sessionPaceZones = paceZones ?? (targetMarathonPaceSecPerKm ? { labels: {} } : null);
  if (targetMarathonPaceSecPerKm && sessionPaceZones) sessionPaceZones.labels.targetMarathon = paceLabel(targetMarathonPaceSecPerKm);
  const totalWeeks = Math.min(weeksToRace, 52);
  const warnings = [];
  if (weeksToRace < 10) warnings.push("Less than 10 weeks remain. This prototype cannot establish whether a safe marathon build is feasible; consider a qualified coach and/or a later race.");
  if (weeksToRace > 52) warnings.push("The race is more than a year away. This plan covers the next 52 weeks only; regenerate it later rather than treating it as a fixed year-long prescription.");
  if (context.loadBand === "low") warnings.push("Current sustainable running load is low. This is a conservative base plan, not a promise of marathon readiness.");
  if (runner.daysAvailable < 3) warnings.push("Fewer than 3 running days per week are available; a typical marathon preparation may not be feasible with this schedule.");
  if (runner.daysAvailable === 1) warnings.push("With one running day available, weekly volume is capped to the recent longest run to avoid concentrating the whole weekly target into one session.");
  const weeks = [];
  // Progress against the most recent non-recovery week, not the artificially reduced recovery week.
  let peakTargetKm = runner.weeklyKm;
  let peakLongKm = Math.min(runner.longestRunKm, runner.weeklyKm);
  let previousLongKm = peakLongKm;
  for (let i = 1; i <= totalWeeks; i++) {
    const phase = phaseForWeek(i, totalWeeks);
    const recovery = i % 4 === 0 && phase !== "taper";
    const priorPeak = peakTargetKm;
    let targetKm;
    if (phase === "taper") {
      // Taper percentages refer to the established build load, not to each preceding taper week.
      targetKm = round1(priorPeak * (i === totalWeeks ? 0.55 : 0.75));
    } else if (recovery) {
      targetKm = round1(priorPeak * 0.8);
    } else if (i === 1) {
      // Never force an increase in the first week just because the race date is near.
      targetKm = round1(runner.weeklyKm);
    } else {
      const nextStep = priorPeak === 0 ? 0 : Math.max(0.5, priorPeak * 0.05);
      targetKm = round1(Math.min(priorPeak + nextStep, runner.weeklyKm * 1.45, runner.weeklyKm + 8));
    }
    targetKm = Math.max(0, targetKm);

    const longCap = context.loadBand === "low" ? 0.36 : context.loadBand === "building" ? 0.38 : 0.4;
    let longKm;
    if (phase === "taper") {
      longKm = round1(Math.min(peakLongKm * (i === totalWeeks ? 0.55 : 0.75), targetKm * longCap));
    } else if (recovery) {
      longKm = round1(Math.min(previousLongKm * 0.8, targetKm * longCap));
    } else if (i === 1) {
      longKm = round1(Math.min(runner.longestRunKm, targetKm * longCap));
    } else {
      longKm = round1(Math.min(previousLongKm + 1, targetKm * longCap, targetKm));
    }
    longKm = Math.max(0, longKm);
    const sessions = assignSessionDays(splitSessions({ targetKm, longKm, days: runner.daysAvailable, context, phase, recovery, runner, paceZones: sessionPaceZones }), runner.daysAvailable);
    const actualKm = round1(sessions.reduce((sum, s) => sum + s.distanceKm, 0));
    weeks.push({
      week: i, phase, recovery, targetKm: actualKm, sessions,
      guidance: recovery ? "Recovery week: reduce volume; keep all sessions easy and shorten further if fatigue persists."
        : phase === "taper" ? "Taper: reduce volume from the build peak, avoid catch-up sessions, and prioritize sleep and recovery."
        : phase === "specific" ? "Specific phase: quality is optional and only for runners already tolerating structured work."
        : "Keep easy running conversational; use run/walk as needed."
    });
    if (!recovery && phase !== "taper") {
      peakTargetKm = Math.max(peakTargetKm, actualKm);
      peakLongKm = Math.max(peakLongKm, longKm);
    }
    previousLongKm = longKm;
  }
  return {
    id: options.id ?? `plan-${Date.now()}`, version: 1, generatedAt: new Date().toISOString(),
    startDate: today, raceDate: runner.raceDate, level: runner.level, context, totalWeeks,
    weeks, warnings, paceZones, goalMarathonTimeSec: runner.goalMarathonTimeSec ?? null, targetMarathonPaceSecPerKm,
    disclaimer: "Prototype training guidance, not medical advice or a validated marathon prescription. Stop for concerning symptoms and seek qualified advice. Race readiness is not guaranteed."
  };
}

export function reviewTrainingWeek({ runner, plannedKm, completedWorkouts, missedSessions = 0, painReported = false, unusualFatigue = false }) {
  const validation = validateRunner(runner);
  if (!validation.ok) throw new TypeError(validation.errors.join(" "));
  if (!Number.isFinite(plannedKm) || plannedKm < 0) throw new TypeError("plannedKm must be a non-negative number.");
  if (!Array.isArray(completedWorkouts)) throw new TypeError("completedWorkouts must be an array.");
  if (!Number.isInteger(missedSessions) || missedSessions < 0) throw new TypeError("missedSessions must be a non-negative integer.");
  for (const item of completedWorkouts) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new TypeError("Each completed workout must be an object.");
    if (item.distanceKm != null && (!Number.isFinite(item.distanceKm) || item.distanceKm < 0)) throw new TypeError("Workout distanceKm must be a non-negative number.");
    if (item.rpe != null && (!Number.isInteger(item.rpe) || item.rpe < 1 || item.rpe > 10)) throw new TypeError("Workout RPE must be an integer from 1 to 10.");
  }
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
