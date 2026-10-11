// Prova end-to-end in Chromium: node e2e/app.e2e.mjs  (serve la cartella da sé).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { decodeFit, decodeFitActivities, crc16 } from "../src/import/fit.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = http.createServer((req, res) => {
  const file = path.join(root, req.url.split("?")[0] === "/" ? "index.html" : req.url.split("?")[0]);
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" }); fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/index.html`;
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const errors = [];
let step = 0;
const ok = label => console.log(`✓ ${++step}. ${label}`);

async function newPage(now = "2026-10-11T08:00:00") {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, acceptDownloads: true });
  await ctx.clock.install({ time: new Date("2026-10-11T08:00:00") });
  await ctx.route("https://geocoding-api.open-meteo.com/**", r => r.fulfill({ json: { results: [{ name: "Milano", latitude: 45.46, longitude: 9.19 }] } }));
  await ctx.route("https://api.open-meteo.com/**", r => r.fulfill({ json: { daily: { time: ["2026-11-18"], temperature_2m_max: [28], temperature_2m_min: [18], precipitation_probability_max: [10], wind_speed_10m_max: [12] } } }));
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => m.type() === "error" && errors.push(m.text()));
  page.on("dialog", d => d.accept());
  await page.goto(base);
  return { ctx, page, setNow: async iso => { await ctx.clock.setFixedTime(new Date(iso)); await page.reload(); } };
}
async function createPlan(page, { distance = "marathon", goal = "4:00", extra = {} } = {}) {
  await page.selectOption("[name=distance]", distance);
  await page.fill("[name=raceDate]", "2027-01-31"); await page.fill("[name=goal]", goal);
  for (const [k, v] of Object.entries(extra)) await page.fill(`[name=${k}]`, v);
  await page.click("#profile-form button[type=submit]");
  await page.waitForSelector("#view-oggi:not([hidden])");
}

// 1. tre distanze
for (const [distance, goal, weeks, label] of [["marathon", "4:00", 16, "Maratona"], ["half", "2:00", 12, "Mezza maratona"], ["10k", "55:00", 10, "10 km"]]) {
  const { ctx, page } = await newPage();
  await createPlan(page, { distance, goal });
  await page.click(".tab[data-tab=piano]");
  assert.equal(await page.locator(".week").count(), weeks);
  assert.ok((await page.locator("#view-piano").innerText()).toLowerCase().includes(label.toLowerCase()));
  ok(`piano ${label}: ${weeks} settimane`);
  await ctx.close();
}

// 2. FIT: export, zone cardiache, sposta, feedback, meteo, import
{
  const { ctx, page, setNow } = await newPage();
  await createPlan(page, { extra: { maxHr: "190", city: "Milano" } });
  await setNow("2026-11-18T08:00:00");               // mercoledì: ripetute
  await page.waitForSelector("[data-fit]");
  assert.ok((await page.locator("#view-oggi").innerText()).includes("Meteo · Milano")); ok("meteo mostrato");
  assert.ok((await page.locator("#view-oggi").innerText()).includes("rallentare")); ok("consiglio caldo");

  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#view-oggi [data-fit]")]);
  const file = path.join(root, "e2e", "tmp.fit"); await dl.saveAs(file);
  const bytes = fs.readFileSync(file); fs.unlinkSync(file);
  assert.equal(crc16(bytes, 0, bytes.length - 2), bytes[bytes.length - 2] | bytes[bytes.length - 1] << 8);
  assert.ok(decodeFit(bytes).some(m => m.num === 27)); ok("scarico .FIT valido (CRC e step)");

  await page.click(".tab[data-tab=piano]");
  assert.ok((await page.locator("#view-piano").innerText()).includes("139–152 bpm")); ok("zone cardiache personali");

  await page.click(".tab[data-tab=oggi]");
  const before = await page.locator("#view-oggi h3.session-title").innerText();
  const opts = await page.locator("#view-oggi select[data-move-from] option").allInnerTexts();
  const target = opts.find(o => o.startsWith("GI"));
  await page.selectOption("#view-oggi select[data-move-from]", { label: target });
  await page.waitForTimeout(200);
  assert.ok((await page.locator("#view-oggi").innerText()).includes("Oggi si recupera")); ok(`seduta "${before}" spostata a giovedì`);
  await page.click(".tab[data-tab=piano]");
  assert.ok((await page.locator("details.week.current .day", { hasText: "GI" }).first().innerText()).includes("Ripetute")); ok("spostamento visibile nel piano");

  // feedback nel giorno di riposo ora
  await page.click(".tab[data-tab=oggi]");
  await page.fill("#daily-form [name=distanceKm]", "5"); await page.fill("#daily-form [name=durationMin]", "32");
  await page.click("#daily-form button[type=submit]"); await page.waitForTimeout(200);
  assert.ok((await page.locator("#view-oggi").innerText()).includes("Registrato")); ok("feedback nel giorno di riposo");

  // import FIT (attività sintetica)
  await page.click(".tab[data-tab=progressi]");
  const body = []; const u16 = v => body.push(v & 255, v >> 8), u32 = v => body.push(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255);
  body.push(0x40, 0, 0); u16(18); body.push(4, 2, 4, 0x86, 5, 1, 0x00, 8, 4, 0x86, 9, 4, 0x86);
  body.push(0); u32(Math.floor((Date.UTC(2026, 10, 17, 7) - Date.UTC(1989, 11, 31)) / 1000)); body.push(1); u32(2_400_000); u32(700_000);
  const header = [14, 0x20, 0x54, 0x08, body.length & 255, body.length >> 8, 0, 0, 0x2E, 0x46, 0x49, 0x54, 0, 0];
  const hc = crc16(header, 0, 12); header[12] = hc & 255; header[13] = hc >> 8;
  const all = [...header, ...body]; const c = crc16(all); all.push(c & 255, c >> 8);
  assert.equal(decodeFitActivities(new Uint8Array(all)).length, 1);
  await page.setInputFiles("#activity-file", { name: "corsa.fit", mimeType: "application/octet-stream", buffer: Buffer.from(all) });
  await page.waitForSelector("#confirm-import"); await page.click("#confirm-import");
  await page.waitForTimeout(200);
  assert.ok((await page.locator("#workout-history").innerText()).includes("7 km")); ok("import .FIT");
  assert.ok((await page.locator("#progress-content").innerText()).includes("Carico di allenamento")); ok("carico settimanale");
  await ctx.close();
}

// 3. prima della partenza: feedback accessibile
{
  const { ctx, page } = await newPage();
  await createPlan(page);
  assert.ok((await page.locator("#view-oggi").innerText()).includes("Hai già corso?")); ok("prima della partenza: registra un allenamento");
  await ctx.close();
}
// 4. gara di sabato: le etichette dei giorni seguono le date reali
{
  const { ctx, page } = await newPage();
  await page.fill("[name=raceDate]", "2027-01-30"); await page.fill("[name=goal]", "4:00");
  await page.click("#profile-form button[type=submit]"); await page.waitForSelector("#view-oggi:not([hidden])");
  await page.click(".tab[data-tab=piano]");
  const labels = await page.locator("details.week").last().evaluate(el => { el.open = true; return [...el.querySelectorAll(".day .dn")].map(d => d.textContent.trim().slice(0, 2)); });
  assert.deepEqual(labels, ["DO", "LU", "MA", "ME", "GI", "VE", "SA"]); ok("gara di sabato: etichette giorni corrette");
  await ctx.close();
}

// 5. stato locale corrotto: l'app si apre comunque
{
  const ctx = await browser.newContext();
  await ctx.addInitScript(`localStorage.setItem("running-planner:v2", JSON.stringify({plan:{id:"x",startDate:"2026-10-12",raceDate:"2027-01-31",racePaceSec:341,weeks:[{week:1,days:[]}]},workouts:[null,{date:5}]}))`);
  const page = await ctx.newPage(); page.on("pageerror", e => errors.push(e.message));
  await page.goto(base); await page.waitForTimeout(200);
  assert.equal(await page.locator(".view:not([hidden])").count(), 1); ok("stato corrotto: nessuna pagina bianca");
  await ctx.close();
}

// 6. a 320 px nessuna tab va in overflow orizzontale
{
  const { ctx, page } = await newPage();
  await page.setViewportSize({ width: 320, height: 800 });
  await createPlan(page, { extra: { maxHr: "190" } });
  for (const tab of ["oggi", "piano", "progressi", "profilo"]) {
    await page.click(`.tab[data-tab=${tab}]`);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(over <= 0, `overflow ${tab}: ${over}px`);
  }
  ok("320 px senza overflow"); await ctx.close();
}

await browser.close(); server.close();
assert.deepEqual(errors, [], "errori in console: " + errors.join(" | "));
console.log("Tutto ok");
