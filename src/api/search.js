import { fmtDate, timesBetween } from'../helpers/time.js';
import { INVITE_URL, BASE } from '../configs/defaults.js';


export async function postSearch(page, csrf, { unitId, courtType, dateStr, startHour, duration }) {
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

export function buildJobs({ days, start, end, step, unit, type, duration }) {
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

export async function runQueue(n, items, worker) {
  const res = new Array(items.length); let i=0;
  async function w(){ for(;;){ const k=i++; if(k>=items.length) break; res[k]=await worker(items[k], k); } }
  await Promise.all(Array.from({length: Math.min(n, items.length)}, w));
  return res;
}