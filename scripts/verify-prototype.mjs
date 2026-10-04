import { chromium } from "playwright-core";
/**
 * Phase 1 exit check for prototype/index.html, driven through the real UI in headless Chrome
 * (system Chrome via playwright-core). Writes 28 PNGs to prototype/samples/ and screenshots to
 * the OS temp dir.   npm run check:prototype
 */
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../prototype");
const SHOTS = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), "deloo-shots-"));
const SAMPLES = ROOT + "/samples";
fs.mkdirSync(SAMPLES, { recursive: true });
const log = (...a) => console.log(...a);
const b = await chromium.launch({ channel: "chrome" });
const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 950 } });
const page = await ctx.newPage();
const hosts = new Set(), errors = [];
page.on("request", r => { const u = new URL(r.url()); if (u.protocol !== "file:" && u.protocol !== "data:" && u.protocol !== "blob:") hosts.add(u.hostname); });
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => { if (m.type() === "error" && !/manifest|Failed to load resource/.test(m.text())) errors.push(m.text()); });

// 1. file:// with no server
await page.goto("file://" + ROOT + "/index.html");
await page.waitForSelector(".ob-step h1", { timeout: 15000 });
log("1 file:// onboarding h1:", await page.textContent(".ob-step h1"));

// demo, then each type from a typed brief
await page.goto("file://" + ROOT + "/index.html#demo"); await page.reload();
await page.waitForSelector("#canvas-poster .tpl", { timeout: 15000 });
const EX = {
  event: "Youth conference, 3 Oct, guest speaker Pastor Tolu Adeyemi, theme Rise and Shine, 4pm at the Main Auditorium",
  invite: "Choir anniversary dinner, 14 Nov, 6pm at the Fellowship Hall, dress code all white, RSVP Sister Bola",
  announce: "We've moved, from Sunday 5 Oct all services hold at our new hall on Unity Road, contact the church office",
  quote: "\"Let your light so shine before men\" Matthew 5:16, Sunday thought",
  birthday: "Mama Grace turns 70, 12 Dec, join us to celebrate seventy years of grace, from the family",
  service: "See you Sunday, 10:30am at the Main Auditorium, tagline come as you are",
  thanks: "Thank you for Harvest Thanksgiving 2026, ushers, choir, media team, from the Pastorate"
};
const SIZES = { post: [1080,1080], story: [1080,1920], banner: [1500,500], a5: [874,1240] };
async function say(t) { await page.fill("#composer", t); await page.press("#composer", "Enter"); }
async function idle() { await page.waitForFunction(() => { const d = document.querySelector("#download"); return d && !d.disabled && !document.querySelector(".gen-pill"); }, null, { timeout: 15000 }); }
let downloads = 0;
for (const [type, brief] of Object.entries(EX)) {
  await say("start over");
  await page.waitForFunction(() => !document.querySelector("#canvas-poster"), null, { timeout: 8000 });
  const nForms = await page.locator(".card-form").count();
  await say(brief);
  await page.waitForFunction(n => document.querySelectorAll(".card-form").length > n, nForms, { timeout: 8000 });
  await page.locator(".card-form").last().locator(".btn-generate").click();
  await page.waitForSelector("#canvas-poster .tpl", { timeout: 10000 }); await idle();
  const STYLE = { event: "poster", invite: "ticket", announce: "pinned", quote: "editorial", birthday: "form", service: "billboard", thanks: "receipt" }[type];
  await say("try the " + STYLE + " style"); await page.waitForTimeout(300); await idle();
  const tabs = page.locator("[data-size]");
  const row = [];
  for (let i = 0; i < 4; i++) {
    await tabs.nth(i).click(); await page.waitForTimeout(150);
    const info = await page.evaluate(() => { const p = document.querySelector("#canvas-poster"); return { w: p.offsetWidth, h: p.offsetHeight, tpl: p.firstChild.className, hl: (p.querySelector(".hl")||{}).textContent || "" }; });
    const key = Object.keys(SIZES)[i];
    const ok = info.w === SIZES[key][0] && info.h === SIZES[key][1] && info.hl.trim().length > 0;
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), page.click("#download")]);
    const file = SAMPLES + "/" + dl.suggestedFilename(); await dl.saveAs(file); downloads++;
    await page.waitForFunction(() => document.querySelector("#download") && document.querySelector("#download").textContent === "Download PNG", null, { timeout: 8000 });
    row.push(`${key}:${info.w}x${info.h}${ok ? "" : " FAIL"}`);
  }
  log("2 ", type.padEnd(9), (await page.evaluate(() => document.querySelector("#canvas-poster .tpl").className.split(" ")[1])), row.join("  "));
}
await page.screenshot({ path: SHOTS + "/desktop-thanks.png" });

// 3. brand change restyles every template
const before = await page.evaluate(() => getComputedStyle(document.querySelector("#canvas-poster")).getPropertyValue("--p"));
await say("make it green and gold"); await page.waitForTimeout(1200);
const after = await page.evaluate(() => getComputedStyle(document.querySelector("#canvas-poster")).getPropertyValue("--p"));
log("3 palette --p", before, "->", after);

// 4. copy edit + template swap re-render
await say("start over"); await page.waitForTimeout(400);
let n = await page.locator(".card-form").count();
await say(EX.event); await page.waitForFunction(n => document.querySelectorAll(".card-form").length > n, n);
await page.locator(".card-form").last().locator(".btn-generate").click(); await page.waitForSelector("#canvas-poster .tpl"); await idle();
let t0 = Date.now(); await say("change the date to 5 Oct");
await page.waitForFunction(() => document.querySelector("#canvas-poster").textContent.includes("5 October"), null, { timeout: 5000 });
log("4 copy edit 'change the date to 5 Oct' -> poster shows 5 October in", Date.now() - t0, "ms");
t0 = Date.now(); await say("try the receipt style");
await page.waitForSelector("#canvas-poster .st-receipt", { timeout: 5000 });
log("4 template swap -> st-receipt in", Date.now() - t0, "ms");
log("  downloads saved:", downloads);

// 5. phone layout
const phone = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const pp = await phone.newPage();
await pp.goto("file://" + ROOT + "/index.html#demo"); await pp.reload();
await pp.waitForSelector("#canvas-poster .tpl"); await pp.waitForTimeout(2500);
const ov = await pp.evaluate(() => document.documentElement.scrollWidth - innerWidth);
await pp.screenshot({ path: SHOTS + "/phone-design.png" });
await pp.click('.mnav [data-panel="chat"]'); await pp.waitForTimeout(300); await pp.screenshot({ path: SHOTS + "/phone-chat.png" });
await pp.click('.mnav [data-panel="brand"]'); await pp.waitForTimeout(300); await pp.screenshot({ path: SHOTS + "/phone-brand.png" });
await pp.goto("file://" + ROOT + "/index.html"); await pp.waitForSelector(".ob-step h1"); await pp.click("#ob-start"); await pp.waitForTimeout(400);
await pp.screenshot({ path: SHOTS + "/phone-onboarding.png" });
log("5 phone horizontal overflow px:", ov);
log("screenshots:", SHOTS);
log("hosts contacted:", [...hosts].join(", "));
log("page errors:", errors.length ? errors : "none");
await b.close();
