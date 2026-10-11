export function isValidISODate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
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
