// Codec minimo del formato FIT (Garmin/Coros/Wahoo):
//  - encodeWorkoutFit: seduta strutturata -> file .fit da caricare sull'orologio
//  - decodeFitActivities: file attività .fit -> corse (data, km, durata)
// Nessuna dipendenza. Il decoder legge solo i messaggi "session".

const FIT_EPOCH_MS = Date.UTC(1989, 11, 31, 0, 0, 0);
const CRC_TABLE = [0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401, 0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400];

// Data nel fuso del dispositivo: una corsa alle 00:30 locali non è del giorno prima.
export function localISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function crc16(bytes, start = 0, end = bytes.length) {
  let crc = 0;
  for (let i = start; i < end; i++) {
    const b = bytes[i];
    let tmp = CRC_TABLE[crc & 0xF]; crc = (crc >> 4) & 0x0FFF; crc = crc ^ tmp ^ CRC_TABLE[b & 0xF];
    tmp = CRC_TABLE[crc & 0xF]; crc = (crc >> 4) & 0x0FFF; crc = crc ^ tmp ^ CRC_TABLE[(b >> 4) & 0xF];
  }
  return crc;
}

// Tipi base FIT: [codice, dimensione]
const T = { enum: [0x00, 1], u8: [0x02, 1], u16: [0x84, 2], u32: [0x86, 4], u32z: [0x8C, 4], str: [0x07, 1] };

class Writer {
  constructor() { this.bytes = []; }
  u8(v) { this.bytes.push(v & 0xFF); }
  u16(v) { this.u8(v); this.u8(v >> 8); }
  u32(v) { this.u8(v); this.u8(v >> 8); this.u8(v >> 16); this.u8(v >>> 24); }
}

// fields: [numeroCampo, [codiceTipo, dim], valore, lunghezzaStringa?]
function message(w, localType, globalNum, fields) {
  w.u8(0x40 | localType); w.u8(0); w.u8(0); w.u16(globalNum); w.u8(fields.length);
  for (const [num, type, , len] of fields) { w.u8(num); w.u8(type === T.str ? len : type[1]); w.u8(type[0]); }
  w.u8(localType);
  for (const [, type, value, len] of fields) {
    if (type === T.str) { const enc = new TextEncoder().encode(String(value)).slice(0, len - 1); for (let i = 0; i < len; i++) w.u8(enc[i] ?? 0); }
    else if (type[1] === 1) w.u8(value); else if (type[1] === 2) w.u16(value); else w.u32(value);
  }
}

const speedMmS = paceSec => Math.round(1e6 / paceSec);

// steps = [{k:"run",code,km}|{k:"reps",...}], paces = mappa codice -> sec/km
export function workoutSteps(steps, paces) {
  const out = [];
  const dist = (name, km, code, intensity) => out.push({
    name, durationType: 1, durationValue: Math.round(km * 100000), targetType: 0, targetValue: 0,
    low: Math.round(speedMmS(paces[code]) * 0.97), high: Math.round(speedMmS(paces[code]) * 1.03), intensity
  });
  for (const step of steps) {
    if (step.k === "run") {
      dist(step.code, step.km, step.code, step.code === "RIS" ? 2 : step.code === "DEF" ? 3 : 0);
    } else {
      const start = out.length;
      dist(step.workCode, step.workKm, step.workCode, 5);
      out.push({ name: step.recCode, durationType: 0, durationValue: step.recSec * 1000, targetType: 2, targetValue: 0, low: 0, high: 0, intensity: 4 });
      out.push({ name: "Ripeti", durationType: 6, durationValue: start, targetType: 2, targetValue: step.n, low: 0, high: 0, intensity: 0 });
    }
  }
  return out;
}

export function encodeWorkoutFit({ name, steps, paces, now = Date.now() }) {
  const wsteps = workoutSteps(steps, paces);
  const body = new Writer();
  message(body, 0, 0, [[0, T.enum, 5], [1, T.u16, 255], [2, T.u16, 0], [3, T.u32z, 1], [4, T.u32, Math.floor((now - FIT_EPOCH_MS) / 1000)]]);
  message(body, 1, 26, [[4, T.enum, 1], [6, T.u16, wsteps.length], [8, T.str, name, 16]]);
  wsteps.forEach((s, i) => message(body, 2, 27, [
    [254, T.u16, i], [0, T.str, s.name, 16], [1, T.enum, s.durationType], [2, T.u32, s.durationValue],
    [3, T.enum, s.targetType], [4, T.u32, s.targetValue], [5, T.u32, s.low], [6, T.u32, s.high], [7, T.enum, s.intensity]
  ]));
  const data = body.bytes;
  const header = new Writer();
  header.u8(14); header.u8(0x20); header.u16(2132); header.u32(data.length);
  for (const c of ".FIT") header.u8(c.charCodeAt(0));
  header.u16(crc16(header.bytes, 0, 12));
  const all = [...header.bytes, ...data];
  const crc = crc16(all);
  all.push(crc & 0xFF, crc >> 8);
  return new Uint8Array(all);
}

/* ---------------- decoder ---------------- */
const INVALID = { 1: 0xFF, 2: 0xFFFF, 4: 0xFFFFFFFF };

export function decodeFit(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length < 14 || bytes[8] !== 0x2E || bytes[9] !== 0x46 || bytes[10] !== 0x49 || bytes[11] !== 0x54) throw new Error("Il file non è un FIT valido.");
  const headerSize = bytes[0], dataSize = bytes[4] | bytes[5] << 8 | bytes[6] << 16 | bytes[7] << 24 >>> 0;
  const end = headerSize + (dataSize >>> 0);
  if (end + 2 > bytes.length) throw new Error("File FIT troncato.");
  if (crc16(bytes, 0, end) !== (bytes[end] | bytes[end + 1] << 8)) throw new Error("File FIT danneggiato (CRC errato).");
  const defs = {}, messages = [];
  let pos = headerSize;
  const read = (p, size, little) => {
    let v = 0;
    for (let i = 0; i < size; i++) v += bytes[p + (little ? i : size - 1 - i)] * 2 ** (8 * i);
    return v;
  };
  while (pos < end) {
    const h = bytes[pos++];
    if (h & 0x80) { // timestamp compresso
      const def = defs[(h >> 5) & 3]; if (!def) throw new Error("FIT: definizione mancante.");
      messages.push({ num: def.num, fields: readFields(def, pos, read)}); pos += def.size; continue;
    }
    const local = h & 0x0F;
    if (h & 0x40) {
      const little = bytes[pos + 1] === 0, num = read(pos + 2, 2, little), nf = bytes[pos + 4];
      pos += 5;
      const fields = []; let size = 0;
      for (let i = 0; i < nf; i++) { fields.push({ num: bytes[pos], size: bytes[pos + 1] }); size += bytes[pos + 1]; pos += 3; }
      if (h & 0x20) { const nd = bytes[pos++]; for (let i = 0; i < nd; i++) { size += bytes[pos + 1]; pos += 3; } }
      defs[local] = { num, fields, size, little };
    } else {
      const def = defs[local]; if (!def) throw new Error("FIT: definizione mancante.");
      messages.push({ num: def.num, fields: readFields(def, pos, read) }); pos += def.size;
    }
  }
  return messages;
}
function readFields(def, pos, read) {
  const out = {}; let p = pos;
  for (const f of def.fields) {
    if (f.size === 1 || f.size === 2 || f.size === 4) { const v = read(p, f.size, def.little); out[f.num] = v === INVALID[f.size] ? null : v; }
    p += f.size;
  }
  return out;
}

// Attività -> corse. Una per messaggio "session" (18).
export function decodeFitActivities(buffer) {
  const sessions = decodeFit(buffer).filter(m => m.num === 18);
  return sessions.map((m, i) => {
    const f = m.fields, start = f[2], meters = f[9] != null ? f[9] / 100 : null, timer = f[8] ?? f[7];
    const sport = f[5];
    if (sport != null && sport !== 1 && sport !== 0xFF) return null; // solo corsa
    if (start == null) return null;
    const date = localISODate(new Date(FIT_EPOCH_MS + start * 1000));
    const km = meters != null ? meters / 1000 : null, sec = timer != null ? timer / 1000 : null;
    if (!(km > 0) && !(sec > 0)) return null;
    return { date, distanceKm: km > 0 ? Math.round(km * 100) / 100 : null, durationSec: sec > 0 ? Math.round(sec) : null, rpe: null, source: "fit", externalId: `fit:${start}:${i}`, notes: "" };
  }).filter(Boolean);
}

export function previewFit({ name = "activity.fit", size = 0, buffer }) {
  if (size > 15 * 1024 * 1024) throw new RangeError("Il file supera il limite di 15 MB.");
  const activities = decodeFitActivities(buffer);
  if (!activities.length) throw new Error("Nessuna corsa trovata nel file FIT.");
  return { format: "fit", count: activities.length, activities, warnings: ["Controlla data, distanza e durata prima di confermare. L'anteprima non salva nulla."] };
}
