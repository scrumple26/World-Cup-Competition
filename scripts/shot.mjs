// Dev-only screenshot helper.
// Usage: node scripts/shot.mjs <path> <outfile> [seedUid]
// If seedUid is given, logs in as that mock user (sets localStorage) before capturing.
import { chromium } from "playwright";

const [, , routePath = "/", outfile = "shot.png", seedUid] = process.argv;
const BASE = "http://localhost:3000";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

if (seedUid) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate((uid) => {
    localStorage.setItem("wc.mock.currentUid", JSON.stringify(uid));
  }, seedUid);
}

await page.goto(BASE + routePath, { waitUntil: "networkidle" });
await page.waitForTimeout(900);
await page.screenshot({ path: outfile, fullPage: true });
await browser.close();
console.log("saved", outfile);
