const STORAGE_KEY = "running-planner:v1";

export function createLocalStore(storage = globalThis.localStorage) {
  function read() {
    if (!storage) return { runners: [], plans: [], workouts: [], adjustments: [] };
    try {
      const parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}");
      return {
        runners: Array.isArray(parsed.runners) ? parsed.runners : [],
        plans: Array.isArray(parsed.plans) ? parsed.plans : [],
        workouts: Array.isArray(parsed.workouts) ? parsed.workouts : [],
        adjustments: Array.isArray(parsed.adjustments) ? parsed.adjustments : []
      };
    } catch {
      // Corrupt local state is not trusted or executed.
      return { runners: [], plans: [], workouts: [], adjustments: [] };
    }
  }
  return {
    read,
    write(state) {
      if (!storage) throw new Error("Browser storage is unavailable.");
      if (!state || typeof state !== "object" || Array.isArray(state)) throw new TypeError("State must be an object.");
      const safe = {
        runners: Array.isArray(state.runners) ? state.runners : [],
        plans: Array.isArray(state.plans) ? state.plans : [],
        workouts: Array.isArray(state.workouts) ? state.workouts : [],
        adjustments: Array.isArray(state.adjustments) ? state.adjustments : []
      };
      storage.setItem(STORAGE_KEY, JSON.stringify(safe));
      return safe;
    },
    clear() {
      if (!storage) return;
      storage.removeItem(STORAGE_KEY);
    }
  };
}
