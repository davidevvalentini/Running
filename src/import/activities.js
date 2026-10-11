const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_TEXT_CHARS = 10_000_000;

function safeNumber(value) {
  if (value == null || String(value).trim() === "") return null;
  const n = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function dateOnly(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text; // data semplice: nessuna conversione di fuso
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function workoutRow(row, source) {
  const distanceKm = safeNumber(row.distanceKm);
  const durationSec = safeNumber(row.durationSec);
  if ((!distanceKm || distanceKm <= 0) && (!durationSec || durationSec <= 0)) return null;
  if (distanceKm != null && (distanceKm <= 0 || distanceKm > 300)) return null;
  if (durationSec != null && (durationSec <= 0 || durationSec > 48 * 3600)) return null;
  return {
    date: dateOnly(row.date) ?? new Date().toISOString().slice(0, 10),
    distanceKm: distanceKm > 0 ? distanceKm : null,
    durationSec: durationSec > 0 ? durationSec : null,
    rpe: null, source, externalId: row.externalId ?? null, notes: ""
  };
}
function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) throw new Error("CSV needs a header and at least one activity.");
  const delimiter = (lines[0].match(/;/g) ?? []).length > (lines[0].match(/,/g) ?? []).length ? ";" : ",";
  const parseLine = line => {
    const out = []; let current = ""; let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"' && quoted && line[i + 1] === '"') { current += '"'; i++; }
      else if (c === '"') quoted = !quoted;
      else if (c === delimiter && !quoted) { out.push(current.trim()); current = ""; }
      else current += c;
    }
    if (quoted) throw new Error("Malformed CSV: unclosed quoted field.");
    out.push(current.trim()); return out;
  };
  const headers = parseLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const pick = (row, aliases) => { const idx = headers.findIndex(h => aliases.includes(h)); return idx < 0 ? null : row[idx]; };
  return lines.slice(1).map(line => {
    const row = parseLine(line);
    const explicitKm = safeNumber(pick(row, ["distancekm"]));
    const metres = safeNumber(pick(row, ["distancem", "distanceinmeters"]));
    const genericDistance = safeNumber(pick(row, ["distance"]));
    // Generic "Distance" columns vary by exporter: values above 300 are treated as metres, otherwise kilometres.
    const km = explicitKm ?? (metres != null ? metres / 1000 : genericDistance == null ? null : genericDistance > 300 ? genericDistance / 1000 : genericDistance);
    const duration = safeNumber(pick(row, ["durationsec", "durationseconds", "elapsedtime", "movingtime"]));
    return workoutRow({ date: pick(row, ["date", "startdate", "starttime"]), distanceKm: km, durationSec: duration, externalId: pick(row, ["id", "activityid"]) }, "csv");
  }).filter(Boolean);
}
function xmlDocument(text) {
  if (typeof DOMParser === "undefined") throw new Error("GPX/TCX import requires a browser with DOMParser.");
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Invalid XML file.");
  return doc;
}
function parseGpx(text) {
  const doc = xmlDocument(text);
  const tracks = [...doc.querySelectorAll("trk")];
  return tracks.map((track, i) => {
    const points = [...track.querySelectorAll("trkpt")];
    if (!points.length) return null;
    let metres = 0, previous = null;
    for (const point of points) {
      const lat = Number(point.getAttribute("lat")), lon = Number(point.getAttribute("lon"));
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (previous) {
        const rad = n => n * Math.PI / 180;
        const dLat = rad(lat - previous.lat), dLon = rad(lon - previous.lon);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(previous.lat)) * Math.cos(rad(lat)) * Math.sin(dLon / 2) ** 2;
        metres += 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
      }
      previous = { lat, lon };
    }
    const times = points.map(p => Date.parse(p.querySelector("time")?.textContent ?? "")).filter(Number.isFinite);
    const durationSec = times.length > 1 ? Math.max(0, (Math.max(...times) - Math.min(...times)) / 1000) : null;
    const date = times.length ? new Date(Math.min(...times)).toISOString() : null;
    return workoutRow({ date, distanceKm: metres / 1000, durationSec, externalId: track.querySelector("name")?.textContent ?? String(i) }, "gpx");
  }).filter(Boolean);
}
function parseTcx(text) {
  const doc = xmlDocument(text);
  return [...doc.querySelectorAll("Activity")].map((activity, i) => {
    let metres = 0, duration = 0;
    for (const lap of activity.querySelectorAll("Lap")) {
      metres += safeNumber(lap.querySelector("DistanceMeters")?.textContent) ?? 0;
      duration += safeNumber(lap.querySelector("TotalTimeSeconds")?.textContent) ?? 0;
    }
    const date = activity.querySelector("Id")?.textContent ?? null;
    return workoutRow({ date, distanceKm: metres / 1000, durationSec: duration, externalId: activity.getAttribute("Sport") ?? String(i) }, "tcx");
  }).filter(Boolean);
}

export function previewActivities({ name = "activity", size = 0, text, format }) {
  if (size > MAX_FILE_BYTES) throw new RangeError("File exceeds the 15 MB import limit.");
  if (typeof text !== "string" || text.length > MAX_TEXT_CHARS) throw new RangeError("Text content is missing or exceeds the import limit.");
  const ext = String(format ?? name.split(".").pop()).toLowerCase().replace(/^\./, "");
  let activities;
  if (ext === "csv") activities = parseCsv(text);
  else if (ext === "gpx") activities = parseGpx(text);
  else if (ext === "tcx") activities = parseTcx(text);
  else if (ext === "fit") throw new Error("FIT decoder is not yet installed. Add a maintained FIT parser and validate its output before enabling FIT imports.");
  else throw new Error("Unsupported format. Choose FIT, GPX, TCX or CSV.");
  if (!activities.length) throw new Error("No valid running activities found in the file.");
  return { format: ext, count: activities.length, activities, warnings: ["Review dates, distance and duration before confirming import. Activities are not saved by preview."] };
}
