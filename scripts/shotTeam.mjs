// Seeds a couple of mock predictions for seed-1, then screenshots their profile.
import { chromium } from "playwright";
const BASE = "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  localStorage.setItem("wc.mock.currentUid", JSON.stringify("seed-1"));
  localStorage.setItem(
    "wc.mock.preds.match.seed-1",
    JSON.stringify({
      1489369: { fixtureId: 1489369, home: 3, away: 1, submittedAt: 0 },
      1489370: { fixtureId: 1489370, home: 2, away: 2, submittedAt: 0 },
    }),
  );
});
await page.goto(BASE + "/team/seed-1", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.screenshot({ path: ".shots/11-team.png", fullPage: false });
await browser.close();
console.log("saved team");
