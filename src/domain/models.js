export const LEVELS = Object.freeze(["beginner", "intermediate", "advanced"]);
export const DECISIONS = Object.freeze(["maintain", "progress", "reduce", "pause"]);
export const WORKOUT_TYPES = Object.freeze(["easy", "run_walk", "long", "threshold", "intervals", "marathon_pace", "rest"]);

export function isValidISODate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function validateRunner(input) {
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, errors: ["Runner profile must be an object."] };
  if (!LEVELS.includes(input.level)) errors.push("level must be beginner, intermediate or advanced.");
  if (!Number.isFinite(input.weeklyKm) || input.weeklyKm < 0 || input.weeklyKm > 300) errors.push("weeklyKm must be between 0 and 300.");
  if (!Number.isFinite(input.longestRunKm) || input.longestRunKm < 0 || input.longestRunKm > 100) errors.push("longestRunKm must be between 0 and 100.");
  if (!Number.isInteger(input.daysAvailable) || input.daysAvailable < 1 || input.daysAvailable > 7) errors.push("daysAvailable must be an integer from 1 to 7.");
  if (!isValidISODate(input.raceDate)) errors.push("raceDate must be a real calendar date in YYYY-MM-DD format.");
  if (input.recentPaceSecPerKm != null && (!Number.isFinite(input.recentPaceSecPerKm) || input.recentPaceSecPerKm < 150 || input.recentPaceSecPerKm > 1200)) errors.push("recentPaceSecPerKm must be between 150 and 1200.");
  if (input.goalMarathonTimeSec != null && (!Number.isFinite(input.goalMarathonTimeSec) || input.goalMarathonTimeSec < 2 * 3600 || input.goalMarathonTimeSec > 8 * 3600)) errors.push("goalMarathonTimeSec must be between 2 and 8 hours.");
  const hasRaceDistance = input.recentRaceDistanceKm != null && input.recentRaceDistanceKm !== "";
  const hasRaceTime = input.recentRaceTimeSec != null && input.recentRaceTimeSec !== "";
  if (hasRaceDistance !== hasRaceTime) errors.push("recentRaceDistanceKm and recentRaceTimeSec must be supplied together.");
  if (hasRaceDistance && (!Number.isFinite(input.recentRaceDistanceKm) || ![5, 10, 21.0975].includes(input.recentRaceDistanceKm))) errors.push("recentRaceDistanceKm must be 5, 10 or 21.0975 km.");
  if (hasRaceTime && (!Number.isFinite(input.recentRaceTimeSec) || input.recentRaceTimeSec < 600 || input.recentRaceTimeSec > 8 * 3600)) errors.push("recentRaceTimeSec must be between 10 minutes and 8 hours.");
  if (input.hasConcerningSymptoms != null && typeof input.hasConcerningSymptoms !== "boolean") errors.push("hasConcerningSymptoms must be boolean.");
  return { ok: errors.length === 0, errors };
}

export function createWorkout(input) {
  if (!input || typeof input !== "object") throw new TypeError("Workout must be an object.");
  const distanceKm = input.distanceKm == null ? null : Number(input.distanceKm);
  const durationSec = input.durationSec == null ? null : Number(input.durationSec);
  if (distanceKm != null && (!Number.isFinite(distanceKm) || distanceKm <= 0 || distanceKm > 300)) throw new RangeError("distanceKm must be between 0 and 300.");
  if (durationSec != null && (!Number.isFinite(durationSec) || durationSec <= 0 || durationSec > 48 * 3600)) throw new RangeError("durationSec must be between 0 and 48 hours.");
  if (distanceKm == null && durationSec == null) throw new TypeError("Workout requires distance or duration.");
  const date = input.date ?? new Date().toISOString().slice(0, 10);
  if (!isValidISODate(date)) throw new TypeError("date must be a real calendar date in YYYY-MM-DD format.");
  const rpe = input.rpe == null ? null : Number(input.rpe);
  if (rpe != null && (!Number.isInteger(rpe) || rpe < 1 || rpe > 10)) throw new RangeError("rpe must be an integer from 1 to 10.");
  return {
    id: input.id ?? globalThis.crypto?.randomUUID?.() ?? `workout-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    date, distanceKm, durationSec, rpe,
    source: input.source ?? "manual",
    externalId: input.externalId ?? null,
    notes: typeof input.notes === "string" ? input.notes.slice(0, 2000) : "",
    createdAt: input.createdAt ?? new Date().toISOString()
  };
}
