import { parseAvailability } from'../helpers/parser.js';
import { validateSession, interactiveLogin, csrfFromInvite } from'../auth/session.js';
import { postSearch, buildJobs, runQueue } from'../api/search.js';
import { DEFAULTS, INVITE_URL } from'../configs/defaults.js';


import { chromium } from "playwright";
import fs from "node:fs";



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

function summarize(rows) {
  const ok = rows.filter(r => r.ok && r.available);
  const grouped = {};
  for (const r of ok) (grouped[r.date] ||= []).push({ time: r.time, courts: r.courts });
  for (const d in grouped) grouped[d].sort((a,b)=>a.time.localeCompare(b.time));
  const dayTotals = Object.fromEntries(Object.entries(grouped).map(([d,arr]) => [d, arr.reduce((s,x)=>s+x.courts,0)]));
  return { ok, grouped, dayTotals };
}

export default async function main() {
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
        const { count, numbers } = parseAvailability(r.text);
        return { ok: true, date: job.dateStr, time: job.startHour, courts: count, courtNumbers: numbers, available: count > 0 };
      } catch (e) {
        return { ok: false, date: job.dateStr, time: job.startHour, courts: 0, available: false, error: String(e) };
      }
    });
  
    const { ok, grouped, dayTotals } = summarize(rows);
    if (ok.length) console.table(ok.map(r => ({ date: r.date, time: r.time, courts: r.courts, courtNumbers: (r.courtNumbers || []).join(",") })));
    console.table(Object.entries(dayTotals).map(([date, totalCourts]) => ({ date, totalCourts })));
    await browser.close();
}