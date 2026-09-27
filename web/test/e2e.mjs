// Two real browsers play a live match through the Worker and the room's Durable Object.
//   npx wrangler dev   (in another shell)
//   NODE_PATH=$(npm root -g) node test/e2e.mjs [http://127.0.0.1:8787] [shots-dir]
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.argv[2] || "http://127.0.0.1:8787";
const SHOTS = process.argv[3] || null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const stamp = Date.now().toString(36).slice(-5);
const fail = (msg) => {
  console.error("FAIL:", msg);
  process.exit(1);
};

const remote = !/localhost|127\.0\.0\.1/.test(BASE);
const proxy = remote && process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`] : [];
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", ...proxy] });
async function player(name) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 640 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?nolag`, { waitUntil: "load" });
  await page.waitForFunction(() => !document.getElementById("enterBtn").disabled, null, { timeout: 120000 });
  await page.click("#enterBtn");
  const r = await page.evaluate(async (n) => {
    const res = await fetch("/api/enlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: n }) });
    return res.status;
  }, name);
  if (r !== 201) fail(`enlist ${name}: ${r}`);
  await page.evaluate(() => window.__app.refreshMe());
  return { page, name, errors };
}

const state = (p) => p.page.evaluate(() => {
  const v = window.__app.view;
  return v.s ? { phase: v.s.phase, turn: v.s.turn, volleys: v.s.volleys, me: v.s.me, opp: v.s.opp, result: v.s.result, animating: v.animating } : null;
});
const until = (p, fn, arg, timeout = 180000) => p.page.waitForFunction(fn, arg, { timeout, polling: 250 });
const shot = async (p, name) => SHOTS && p.page.screenshot({ path: `${SHOTS}/${p.name}-${name}.png` });

const A = await player(`Alpha${stamp}`);
const B = await player(`Bravo${stamp}`);
console.log("enlisted", A.name, B.name);

await A.page.click("[data-open=friendSub]");
await A.page.click("#createBtn");
await until(A, () => document.getElementById("roomCode").textContent.length === 5 && document.body.dataset.screen === "wait");
const code = await A.page.evaluate(() => document.getElementById("roomCode").textContent);
console.log("room", code);
await shot(A, "1-wait");

await B.page.click("[data-open=friendSub]");
await B.page.fill("#joinCode", code);
await B.page.click("#joinForm button[type=submit]");
for (const p of [A, B]) await until(p, () => window.__app.view.s?.phase === "supply");
console.log("both in the supply draw");

const picks = [["rock", "rock"], ["rock", "scissors"]];
for (const [a, b] of picks) {
  for (const p of [A, B]) await until(p, () => { const v = window.__app.view; return v.s.phase !== "supply" || (!v.s.me.pick && !v.animating); });
  if ((await state(A)).phase !== "supply") break;
  await A.page.click(`[data-pick=${a}]`);
  await B.page.click(`[data-pick=${b}]`);
  await A.page.waitForTimeout(1500);
}
for (const p of [A, B]) await until(p, () => window.__app.view.s?.phase === "deploy" && !window.__app.view.animating);
const sa = await state(A);
const sb = await state(B);
if (sa.me.supplies !== 3 || sb.me.supplies !== 2) console.log("supplies", sa.me.supplies, sb.me.supplies);
console.log("deploy, first shooter:", (await A.page.evaluate(() => window.__app.view.s.first)) === "me" ? A.name : B.name);

const codes = { [A.name]: "1234", [B.name]: "5678" };
for (const p of [A, B]) {
  for (const d of codes[p.name]) await p.page.click(`#pad [data-d="${d}"]`);
  await p.page.click("#fireBtn");
}
for (const p of [A, B]) await until(p, () => window.__app.view.s?.phase === "battle");
console.log("battle");
const leak = await A.page.evaluate(() => JSON.stringify(window.__app.view.s).includes("5678"));
if (leak) fail("A's client state contains B's secret");

// B fires first (lost the draw). B misses, A misses, B hits 2 dead 1 injured, A cracks it.
const plan = [[B, "9012"], [A, "9087"], [B, "1243"], [A, "5678"]];
let n = 0;
for (const [p, guess] of plan) {
  await until(p, () => { const v = window.__app.view; return v.s?.turn === "me" && !v.animating; });
  for (const d of guess) await p.page.click(`#pad [data-d="${d}"]`);
  const other = p === A ? B : A;
  await p.page.click("#fireBtn");
  n++;
  if (guess === "1243") {
    const down = () => window.__app.army.squad("me").filter((s) => s.state === "dead" || s.state === "sink").length >= 2;
    await until(other, down, null, 60000).catch(() => {});
    await shot(other, "hit");
    const lost = await other.page.evaluate(() => window.__app.army.squad("me").filter((s) => s.state === "dead" || s.state === "sink").length);
    console.log(`${other.name} watched ${lost} of their soldiers fall`);
    if (lost !== 2) fail(`expected 2 of ${other.name}'s soldiers down, saw ${lost}`);
  }
  await until(p, (k) => window.__app.view.s?.volleys.length >= k, n);
}
for (const p of [A, B]) await until(p, () => window.__app.view.s?.phase === "over");
const ra = (await state(A)).result;
const rb = (await state(B)).result;
console.log("A result", ra.winner, ra.reason, ra.codes, "| B result", rb.winner, rb.reason);
if (ra.winner !== "me" || rb.winner !== "opp") fail("wrong winner");
if (ra.codes.opp !== "5678" || rb.codes.opp !== "1234") fail("codes not revealed at the end");
await shot(A, "over");
await shot(B, "over");

const board = await A.page.evaluate(async () => (await (await fetch("/api/leaderboard")).json()).players);
const row = board.find((r) => r.name === A.name);
if (!row || row.wins < 1) fail("the win was not recorded");
console.log("leaderboard row", row);

await A.page.click("#rematchBtn");
await B.page.click("#rematchBtn");
for (const p of [A, B]) await until(p, () => window.__app.view.s?.phase === "supply" && window.__app.view.s.match === 2);
console.log("rematch started");

const errors = [...A.errors, ...B.errors];
if (errors.length) fail(errors.join("\n"));
console.log("PASS");
await browser.close();
