import { chromium } from "playwright";
import { DEFAULTS, LOGIN_URL, INVITE_URL, } from "../configs/defaults.js";

export async function csrfFromInvite(page, timeout=30000) {
  const input = page.locator('input[name="authenticity_token"]');
  await input.waitFor({ timeout, state: "attached" }).catch(async () => {
    await page.reload({ waitUntil: "load" });
    await input.waitFor({ timeout: 15000, state: "attached" });
  });
  const v = await input.getAttribute("value");
  if (!v) throw new Error("authenticity_token not found");
  return v;
}

export async function validateSession(statePath, headless) {
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

export async function interactiveLogin(statePath, timeout=DEFAULTS.timeout) {
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