const STORAGE_KEY = "running-planner:v2";
const EMPTY = () => ({ profile: null, plan: null, workouts: [], feedback: [], dismissed: [], savedAt: 0 });

export function createLocalStore(storage = globalThis.localStorage) {
  const sanitize = parsed => ({
    profile: parsed.profile && typeof parsed.profile === "object" ? parsed.profile : null,
    plan: parsed.plan && Array.isArray(parsed.plan.weeks) ? parsed.plan : null,
    workouts: Array.isArray(parsed.workouts) ? parsed.workouts : [],
    feedback: Array.isArray(parsed.feedback) ? parsed.feedback : [],
    dismissed: Array.isArray(parsed.dismissed) ? parsed.dismissed : [],
    savedAt: Number.isFinite(parsed.savedAt) ? parsed.savedAt : 0
  });
  return {
    read() {
      if (!storage) return EMPTY();
      try { return sanitize(JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}")); } catch { return EMPTY(); }
    },
    write(state) {
      if (!storage) throw new Error("Archivio del browser non disponibile.");
      const safe = sanitize(state ?? {});
      storage.setItem(STORAGE_KEY, JSON.stringify(safe));
      return safe;
    },
    clear() { storage?.removeItem(STORAGE_KEY); }
  };
}
