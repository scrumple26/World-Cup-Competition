import { chromium } from "playwright";

const TEST_EMAIL = `wc-signup-test+${Date.now()}@example.com`;
const TEST_PASSWORD = "TestPass123!";
const TEAM = "QA Test FC";

const netLog = [];
const consoleLog = [];

const browser = await chromium.launch();
const page = await browser.newPage();

page.on("console", (m) => consoleLog.push(`[${m.type()}] ${m.text()}`));
page.on("response", async (res) => {
  const url = res.url();
  if (url.includes("/api/") || url.includes("identitytoolkit") || url.includes("googleapis")) {
    let body = "";
    try { body = (await res.text()).slice(0, 400); } catch {}
    netLog.push({ status: res.status(), url: url.replace(/key=[^&]+/, "key=***"), body });
  }
});

console.log("TEST EMAIL:", TEST_EMAIL);

await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

// Ensure signup mode is active
await page.getByRole("button", { name: "Create account" }).first().click().catch(() => {});

await page.getByPlaceholder("Nolan").fill("Quinn");
await page.getByPlaceholder("Smith").fill("Tester");
await page.getByPlaceholder("e.g. Galaxy Strikers").fill(TEAM);
await page.getByPlaceholder("you@example.com").fill(TEST_EMAIL);
await page.getByPlaceholder("••••••••").fill(TEST_PASSWORD);

await page.getByRole("button", { name: /Create account & join/i }).click();

// Wait for verification screen OR an inline error
const verif = page.getByText("Check your email", { exact: false });
const errBox = page.locator(".bg-red-500\\/10");

let outcome = "unknown";
try {
  await Promise.race([
    verif.waitFor({ state: "visible", timeout: 20000 }).then(() => (outcome = "verification-screen")),
    errBox.first().waitFor({ state: "visible", timeout: 20000 }).then(() => (outcome = "error")),
  ]);
} catch {
  outcome = "timeout";
}

// give network a moment to settle
await page.waitForTimeout(1500);

let errText = "";
if (await errBox.first().isVisible().catch(() => false)) {
  errText = await errBox.first().innerText().catch(() => "");
}

await page.screenshot({ path: "scripts/signup-result.png", fullPage: true });

console.log("\n=== OUTCOME:", outcome, "===");
if (errText) console.log("ERROR SHOWN:", errText);

console.log("\n=== NETWORK (api/auth) ===");
for (const n of netLog) console.log(`${n.status}  ${n.url}\n     ${n.body.replace(/\n/g, " ")}`);

console.log("\n=== CONSOLE ERRORS ===");
for (const c of consoleLog.filter((x) => x.startsWith("[error]"))) console.log(c);

await browser.close();

// emit machine-readable result
console.log("\nRESULT_JSON", JSON.stringify({ outcome, errText, email: TEST_EMAIL }));
