// courtFinderCLI.js (Node 18+ / CommonJS)
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "https://center.tennis.org.il";
const LOGIN_URL = `${BASE}/self_services/login`;
const INVITE_URL = `${BASE}/self_services/court_invitation`;

const DEFAULTS = {
  days: 14, start: "20:00", end: "23:00", step: 30, duration: 2,
  unit: 11, type: 1, concurrency: 6, statePath: "auth.json",
  headlessIfAuthed: true, timeout: 120000
};

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const flag = (k) => process.argv.includes(`--${k}`);

const CFG = {
  days: parseInt(arg("days", DEFAULTS.days), 10),
  start: arg("start", DEFAULTS.start),
  end: arg("end", DEFAULTS.end),
  step: parseInt(arg("step", DEFAULTS.step), 10),
  duration: parseFloat(arg("duration", DEFAULTS.duration)),
  unit: parseInt(arg("unit", DEFAULTS.unit), 10),
  type: parseInt(arg("type", DEFAULTS.type), 10),
  concurrency: parseInt(arg("concurrency", DEFAULTS.concurrency), 10),
  out: arg("out", "slots.json"),
  headful: flag("headful"),
  login: flag("login"),
};

const fmtDate = (d) => `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
function timesBetween(start, end, step) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const S = sh*60+sm, E = eh*60+em, out = [];
  for (let t=S; t<=E; t+=step) out.push(`${String(Math.floor(t/60)).padStart(2,"0")}:${String(t%60).padStart(2,"0")}`);
  return out;
}

function buildJobs({ days, start, end, step, unit, type, duration }) {
  const hours = timesBetween(start, end, step);
  const base = new Date();
  const jobs = [];
  for (let d=0; d<=days; d++) {
    const dt = new Date(base); dt.setDate(dt.getDate()+d);
    const dateStr = fmtDate(dt);
    for (const h of hours) jobs.push({ unitId: unit, courtType: type, dateStr, startHour: h, duration });
  }
  return jobs;
}

async function runQueue(n, items, worker) {
  const res = new Array(items.length); let i=0;
  async function w(){ for(;;){ const k=i++; if(k>=items.length) break; res[k]=await worker(items[k], k); } }
  await Promise.all(Array.from({length: Math.min(n, items.length)}, w));
  return res;
}

function parseAvailability(text) {
  if (text.includes("לא נמצאו מגרשים פנויים")) return { count: 0, numbers: [] };
  let count = 0;
  const m = text.match(/נמצאו\s+(\d+)\s+מגרש(?:ים)?\s+פנוי(?:ים)?/);
  if (m) count = parseInt(m[1], 10);
  else if (/נמצא\s+מגרש\s+פנוי/.test(text)) count = 1;
  const numbers = Array.from(text.matchAll(/מגרש:\s*(\d+)/g)).map(x => Number(x[1]));
  if (!count && numbers.length) count = numbers.length;
  return { count, numbers };
}


async function csrfFromInvite(page, timeout=30000) {
  const input = page.locator('input[name="authenticity_token"]');
  await input.waitFor({ timeout, state: "attached" }).catch(async () => {
    await page.reload({ waitUntil: "load" });
    await input.waitFor({ timeout: 15000, state: "attached" });
  });
  const v = await input.getAttribute("value");
  if (!v) throw new Error("authenticity_token not found");
  return v;
}

async function validateSession(statePath, headless) {
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ storageState: statePath });
  const page = await context.newPage();
  try {
    await page.goto(INVITE_URL, { waitUntil: "domcontentloaded" });
    const csrf = await csrfFromInvite(page, 20000);
    return { ok: true, browser, context, page, csrf };
  } catch {
    await browser.close();
    return { ok: false };
  }
}

async function interactiveLogin(statePath, timeout=DEFAULTS.timeout) {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
  await page.waitForURL(u => u.toString().startsWith(INVITE_URL), { timeout });
  const csrf = await csrfFromInvite(page, 30000);
  await context.storageState({ path: statePath });
  console.log("💾 Session saved to auth.json");
  await browser.close();
  return csrf;
}

async function postSearch(page, csrf, { unitId, courtType, dateStr, startHour, duration }) {
  const body = new URLSearchParams({
    utf8: "✓",
    authenticity_token: csrf,
    "search[unit_id]": String(unitId),
    "search[court_type]": String(courtType),
    "search[start_date]": dateStr,
    "search[start_hour]": startHour,
    "search[duration]": String(duration),
  });
  const res = await page.request.post(`${BASE}/self_services/search_court.js`, {
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "x-requested-with": "XMLHttpRequest",
      "accept": "*/*;q=0.5, text/javascript, application/javascript, application/ecmascript, application/x-ecmascript",
      "origin": BASE, "referer": INVITE_URL, "accept-language": "en,he-IL;q=0.9,he;q=0.8",
    },
    data: body.toString(),
  });
  return { status: res.status(), ok: res.ok(), text: await res.text() };
}

function summarize(rows) {
  const ok = rows.filter(r => r.ok && r.available);
  const grouped = {};
  for (const r of ok) (grouped[r.date] ||= []).push({ time: r.time, courts: r.courts });
  for (const d in grouped) grouped[d].sort((a,b)=>a.time.localeCompare(b.time));
  const dayTotals = Object.fromEntries(Object.entries(grouped).map(([d,arr]) => [d, arr.reduce((s,x)=>s+x.courts,0)]));
  return { ok, grouped, dayTotals };
}

(async () => {
  const statePath = DEFAULTS.statePath;
  if (CFG.login && fs.existsSync(statePath)) fs.unlinkSync(statePath);

  if (fs.existsSync(statePath) && !CFG.login) {
    const v = await validateSession(statePath, !CFG.headful && DEFAULTS.headlessIfAuthed);
    if (v.ok) {
      console.log("✅ Valid session. Starting scan…");
      const jobs = buildJobs(CFG);
      console.log(`Scanning ${jobs.length} slots… (${CFG.days} days, ${CFG.start}-${CFG.end}, step ${CFG.step}m, duration ${CFG.duration}h)`);
      const rows = await runQueue(CFG.concurrency, jobs, async (job) => {
        try {
            const r = await postSearch(v.page, v.csrf, job);
            const { count, numbers } = parseAvailability(r.text);
            return { ok: true, date: job.dateStr, time: job.startHour, courts: count, courtNumbers: numbers, available: count > 0 };
        } catch (e) {
          return { ok: false, date: job.dateStr, time: job.startHour, courts: 0, available: false, error: String(e) };
        }
      });
      const { ok, grouped, dayTotals } = summarize(rows);
      if (ok.length) console.table(ok.map(r => ({ date: r.date, time: r.time, courts: r.courts, courtNumbers: (r.courtNumbers || []).join(",") })));
      await v.browser.close();
      return;
    }
  }

  const csrf = await interactiveLogin(statePath, DEFAULTS.timeout);
  const browser = await chromium.launch({ headless: !CFG.headful && DEFAULTS.headlessIfAuthed });
  const context = await browser.newContext({ storageState: statePath });
  const page = await context.newPage();
  await page.goto(INVITE_URL, { waitUntil: "domcontentloaded" });
  const csrf2 = await csrfFromInvite(page, 20000) || csrf;

  const jobs = buildJobs(CFG);
  console.log(`Scanning ${jobs.length} slots… (${CFG.days} days, ${CFG.start}-${CFG.end}, step ${CFG.step}m, duration ${CFG.duration}h)`);
  const rows = await runQueue(CFG.concurrency, jobs, async (job) => {
    try {
      const r = await postSearch(page, csrf2, job);
      const count = parseCount(r.text);
      return { ok: true, date: job.dateStr, time: job.startHour, courts: count, available: count > 0 };
    } catch (e) {
      return { ok: false, date: job.dateStr, time: job.startHour, courts: 0, available: false, error: String(e) };
    }
  });

  const { ok, grouped, dayTotals } = summarize(rows);
  if (ok.length) console.table(ok.map(r => ({ date: r.date, time: r.time, courts: r.courts, courtNumbers: (r.courtNumbers || []).join(",") })));
  console.table(Object.entries(dayTotals).map(([date, totalCourts]) => ({ date, totalCourts })));
  await browser.close();
})().catch(e => {
  console.error("Error:", e.message || e);
  process.exit(1);
});