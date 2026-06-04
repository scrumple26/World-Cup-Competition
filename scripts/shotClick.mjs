// node scripts/shotClick.mjs <path> <outfile> <seedUid> <buttonText> [vp]
import { chromium } from "playwright";
const [, , routePath, outfile, seedUid, btnText, mode] = process.argv;
const BASE = "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.evaluate((uid) => localStorage.setItem("wc.mock.currentUid", JSON.stringify(uid)), seedUid);
await page.goto(BASE + routePath, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
if (btnText) {
  await page.getByRole("button", { name: btnText }).first().click();
  await page.waitForTimeout(600);
}
await page.screenshot({ path: outfile, fullPage: mode !== "vp" });
await browser.close();
console.log("saved", outfile);
