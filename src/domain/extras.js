// Zone cardiache personali, carico di allenamento e consigli meteo.

export const HR_ZONES = [
  { zone: "Z2", from: 0.73, to: 0.80 },
  { zone: "Z3", from: 0.80, to: 0.87 },
  { zone: "Z4", from: 0.87, to: 0.93 },
  { zone: "Z5", from: 0.93, to: 1.0 }
];
export function hrZones(maxHr) {
  if (!Number.isFinite(maxHr) || maxHr < 120 || maxHr > 230) return null;
  return HR_ZONES.map(z => ({ zone: z.zone, low: Math.round(maxHr * z.from), high: Math.round(maxHr * z.to) }));
}

// Carico di sessione (Foster): minuti × RPE. Solo per le uscite con entrambi i dati.
export function sessionLoad(workout) {
  return workout.durationSec && workout.rpe ? Math.round((workout.durationSec / 60) * workout.rpe) : 0;
}
export function weeklyLoad(workouts, startDate, endDate) {
  const inWeek = workouts.filter(w => w.date >= startDate && w.date <= endDate);
  return { load: inWeek.reduce((s, w) => s + sessionLoad(w), 0), counted: inWeek.filter(w => sessionLoad(w) > 0).length, total: inWeek.length };
}

// Rallentamento indicativo col caldo (s/km) e avvertenze. Stima prudente, non un modello fisiologico.
export function weatherAdvice({ tempMax, tempMin, rainProb, windMax }) {
  const notes = [];
  let slowdown = 0;
  if (tempMax >= 31) slowdown = 20; else if (tempMax >= 26) slowdown = 15; else if (tempMax >= 21) slowdown = 10; else if (tempMax >= 16) slowdown = 5;
  if (slowdown) notes.push(`Con ${Math.round(tempMax)}° di massima conviene rallentare di circa ${slowdown}"/km e idratarsi bene${tempMax >= 26 ? "; meglio correre al mattino presto o a sera" : ""}.`);
  if (tempMax >= 32) notes.push("Caldo intenso: valuta di spostare o accorciare la qualità.");
  if (tempMin <= 0) notes.push("Rischio ghiaccio: attenzione al fondo e riscaldamento più lungo.");
  if (rainProb >= 60) notes.push(`Pioggia probabile (${Math.round(rainProb)}%): scarpe con buona aderenza.`);
  if (windMax >= 35) notes.push(`Vento forte (${Math.round(windMax)} km/h): giudica lo sforzo, non il passo.`);
  return { slowdown, notes };
}

export async function fetchWeather(city, fetchFn = fetch) {
  const geo = await (await fetchFn(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=it`)).json();
  const place = geo.results?.[0];
  if (!place) throw new Error("Città non trovata.");
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max&timezone=auto&forecast_days=7`;
  const data = await (await fetchFn(url)).json();
  const d = data.daily;
  if (!d?.time) throw new Error("Previsioni non disponibili.");
  return { place: place.name, days: d.time.map((date, i) => ({ date, tempMax: d.temperature_2m_max[i], tempMin: d.temperature_2m_min[i], rainProb: d.precipitation_probability_max[i] ?? 0, windMax: d.wind_speed_10m_max[i] ?? 0 })) };
}
