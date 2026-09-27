// Quick match pairs two searching browsers; a secured callsign signs in from a fresh browser.
//   NODE_PATH=$(npm root -g) node test/quick.mjs [http://127.0.0.1:8787]
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.argv[2] || "http://127.0.0.1:8787";
const tag = Date.now().toString(36).slice(-5);
const fail = (m) => {
  console.error("FAIL:", m);
  process.exit(1);
};
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });

async function open() {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?nolag`, { waitUntil: "load" });
  await page.waitForFunction(() => !document.getElementById("enterBtn").disabled, null, { timeout: 120000 });
  await page.click("#enterBtn");
  return page;
}

async function enlistVia(page, name) {
  await page.click("#quickBtn");
  await page.waitForSelector("#enlistDlg[open]");
  await page.fill("#enlistName", name);
  await page.click("#enlistGo");
}

const a = await open();
const b = await open();
await enlistVia(a, `Quick${tag}A`);
await a.waitForFunction(() => document.body.dataset.screen === "search", null, { timeout: 30000 });
await enlistVia(b, `Quick${tag}B`);
for (const p of [a, b]) await p.waitForFunction(() => window.__app.view.s?.phase === "supply", null, { timeout: 60000 });
const names = await a.evaluate(() => [window.__app.view.s.me.name, window.__app.view.s.opp.name]);
console.log("quick match paired", names.join(" vs "));

// secure A's callsign, then sign in from a new browser
const pw = `pw-${tag}-secret`;
const secured = await a.evaluate(async (password) => (await fetch("/api/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) })).json(), pw);
if (!secured.player?.secured) fail("password not saved");
// The paired browsers are done; closing them keeps a software-rendered run from starving the next one.
for (const p of [a, b]) await p.context().close();
const c = await open();
const bad = await c.evaluate(async (name) => (await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, password: "wrong-password" }) })).status, `Quick${tag}A`);
if (bad !== 401) fail(`wrong password gave ${bad}`);
await c.evaluate(() => document.querySelector('[data-act="signin"]').click());
await c.waitForSelector("#enlistDlg[open]");
await c.fill("#enlistName", `quick${tag}a`);
await c.fill("#enlistPass", pw);
await c.click("#enlistGo");
await c.waitForFunction(() => window.__app.me?.name, null, { timeout: 30000 });
const me = await c.evaluate(() => window.__app.me);
if (me.name !== `Quick${tag}A` || !me.secured) fail("sign in did not restore the callsign");
console.log("signed in on a new browser as", me.name);
const taken = await c.evaluate(async (name) => (await fetch("/api/enlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) })).status, `Quick${tag}B`);
console.log("enlist while signed in returns", taken);
console.log("PASS");
await browser.close();
