// The title in the trench: the buttons over the planks and nameplates, hosting a room, coming
// back into a match already under way, and the tutorials.
//   npx wrangler dev   (in another shell)
//   NODE_PATH=$(npm root -g) node test/title.mjs [http://127.0.0.1:8787]
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.argv[2] || "http://127.0.0.1:8787";
const stamp = Date.now().toString(36).slice(-5);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok, what, detail) => {
  console.log(ok ? "ok  " : "FAIL", what, ok || detail === undefined ? "" : JSON.stringify(detail));
  if (!ok) failures++;
};

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
async function page(width, height, { name = null, touch = width < 900 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: touch, hasTouch: touch });
  await ctx.addInitScript(() => localStorage.setItem("di.intro", "1"));
  const p = await ctx.newPage();
  p.on("pageerror", (e) => check(false, "page error", String(e)));
  if (name) {
    await p.goto(`${BASE}/api/me`);
    const r = await p.evaluate(async (n) => (await fetch("/api/enlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: n }) })).status, name);
    if (r !== 201) check(false, `enlist ${name}`, r);
  }
  return p;
}
async function enter(p, path = "/") {
  await p.goto(`${BASE}${path}${path.includes("?") ? "&" : "?"}nolag`, { timeout: 240000 });
  await p.waitForFunction(() => !document.getElementById("enterBtn").disabled, null, { timeout: 240000 });
  await p.evaluate(() => document.getElementById("enterBtn").click());
}
const at = (p, place) => p.waitForFunction((n) => document.body.dataset.place === n && !window.__app.title.busy, place, { timeout: 180000, polling: 250 });
// Buttons are pressed from inside the page, as a keyboard or a screen reader does.
const hot = (p, label) => p.evaluate((l) => [...document.querySelectorAll("#hots .hot")].find((e) => e.getAttribute("aria-label").startsWith(l)).click(), label);
const click = (p, id) => p.evaluate((i) => document.getElementById(i).click(), id);
const go = async (p, to, opts = {}) => {
  await p.evaluate(([t, o]) => {
    window.__app.title.go(t, o);
    window.__app.director.hurry();
  }, [to, opts]);
  await at(p, to);
};
const title = (p) => p.evaluate(() => {
  const a = window.__app;
  const t = a.title;
  return {
    screen: a.screen, place: t.place, busy: t.busy, hosting: t.hosting || null, joining: t.joining || null,
    sheets: [...document.querySelectorAll("#menu .sheet")].filter((s) => !s.hidden).map((s) => s.id),
    hots: document.querySelectorAll("#hots .hot").length, active: !!a.view.active, path: location.pathname,
    paraded: a.army.paraded, plates: a.network.plates.visible, ranks: a.army.squad("opp").filter((s) => s.rank).length,
  };
});

// 1. Every point along a plank or a nameplate, and a little off its line, presses that object's
// own button, and every such button is at least 44 px each way.
for (const [w, h] of [[390, 844], [844, 390], [1440, 900]]) {
  const p = await page(w, h);
  await enter(p);
  await at(p, "corner");
  for (const place of ["corner", "front"]) {
    if (place === "front") await go(p, "front");
    await p.bringToFront();
    for (let i = 0; i < 3; i++) await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await sleep(500);
    const out = await p.evaluate(() => {
      const t = window.__app.title;
      const net = window.__app.network;
      const cam = window.__app.stage.camera;
      const bad = [];
      for (const h of t.hotEls) {
        const box = net.boxes[h.key];
        if (!box) continue;
        const r = h.el.getBoundingClientRect();
        const m = box.obj.matrixWorld;
        const px = (v) => [((v.x + 1) / 2) * innerWidth, ((1 - v.y) / 2) * innerHeight];
        const [x0, y0] = px(box.a.clone().applyMatrix4(m).project(cam));
        const [x1, y1] = px(box.b.clone().applyMatrix4(m).project(cam));
        const len = Math.hypot(x1 - x0, y1 - y0) || 1;
        const nx = -(y1 - y0) / len;
        const ny = (x1 - x0) / len;
        const style = h.el.style;
        if (parseFloat(style.width) < 44 || parseFloat(style.height) < 44) bad.push(`${h.label} is ${style.width} by ${style.height}`);
        // Off the line only away from the post, where the dog tag hangs beside the planks' roots.
        for (const f of [0.15, 0.5, 0.85]) {
          for (const off of f < 0.3 ? [0] : [-12, 0, 12]) {
            const x = x0 + (x1 - x0) * f + nx * off;
            const y = y0 + (y1 - y0) * f + ny * off;
            if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
            const b = document.elementFromPoint(x, y)?.closest("#hots .hot");
            if (b && b !== h.el) bad.push(`${h.label} at ${f},${off} presses ${b.getAttribute("aria-label")}`);
            if (!b && off === 0 && r.width) bad.push(`${h.label} at ${f} presses nothing`);
          }
        }
      }
      return bad;
    });
    check(!out.length, `${w}x${h} ${place}: the buttons lie over their own objects`, out);
  }
  await p.context().close();
}

// 2. Hosting: the telephone again, P in the dial, Esc, Back, your own room's link, and leaving
// while the room opens or a dialled code is checked.
{
  const p = await page(1280, 800, { name: `Host${stamp}` });
  let slow = 0;
  await p.route("**/api/rooms**", async (route) => {
    if (slow) await sleep(slow);
    await route.continue();
  });
  await enter(p);
  await at(p, "corner");
  const host = async () => {
    await hot(p, "Play a friend");
    await at(p, "signals");
    await click(p, "createBtn");
    await at(p, "war");
    await click(p, "ordersGo");
    await at(p, "signals");
  };
  await host();
  await p.waitForFunction(() => !document.getElementById("waitSheet").hidden, null, { timeout: 60000 });
  const code = (await title(p)).hosting;
  await click(p, "createBtn");
  await sleep(1500);
  let s = await title(p);
  check(s.place === "signals" && s.hosting === code && s.sheets.includes("waitSheet") && s.active, "the telephone again keeps the room open", s);
  await hot(p, "Dial a friend");
  await p.focus("#joinCode");
  await p.keyboard.type("PQP");
  check(await p.evaluate(() => document.getElementById("joinCode").value) === "PQP", "P can be typed while a room is open");
  await p.keyboard.press("Escape");
  await sleep(500);
  s = await title(p);
  check(s.place === "signals" && !s.sheets.includes("dialSheet") && s.hosting === code, "Esc puts the dial away and keeps the room", s);
  await click(p, "backBtn");
  await at(p, "corner");
  s = await title(p);
  check(!s.active && s.path === "/" && !s.hosting, "Back from the dugout closes the room", s);

  const own = await p.evaluate(async () => (await (await fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).json()).code);
  await enter(p, `/r/${own}`);
  await at(p, "signals");
  await p.waitForFunction(() => !document.getElementById("waitSheet").hidden, null, { timeout: 60000 }).catch(() => {});
  s = await title(p);
  check(s.hosting === own && s.sheets.includes("waitSheet") && !s.sheets.includes("joinSheet") && s.active, "your own room's link waits in the room", s);
  await click(p, "backBtn");
  await at(p, "corner");
  s = await title(p);
  check(!s.active && s.path === "/", "and Back closes it", s);

  slow = 6000;
  await host();
  await click(p, "backBtn");
  await at(p, "corner");
  await sleep(8000);
  s = await title(p);
  check(!s.hosting && !s.active && s.path === "/" && !s.sheets.length, "a room that opens after you left is closed again", s);

  await hot(p, "Play a friend");
  await at(p, "signals");
  await hot(p, "Dial a friend");
  await p.evaluate((c) => {
    const i = document.getElementById("joinCode");
    i.value = c;
    i.dispatchEvent(new Event("input"));
    document.getElementById("joinForm").requestSubmit();
  }, own);
  await sleep(200);
  await click(p, "backBtn");
  await at(p, "corner");
  await sleep(8000);
  s = await title(p);
  check(!s.sheets.includes("joinSheet") && !s.joining, "a code that answers after you left brings no telegram", s);
  await p.context().close();
}

// 3. Both sides of a match in battle open the room's link again: the host goes straight back in,
// the guest accepts the telegram; neither keeps anything of the title, and the commanders stand down.
{
  const A0 = await page(1280, 800, { name: `Alpha${stamp}` });
  const B0 = await page(390, 844, { name: `Bravo${stamp}` });
  const code = await A0.evaluate(async () => (await (await fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).json()).code);
  const sock = (p) => p.evaluate((c) => new Promise((res) => {
    const ws = new WebSocket(`${location.origin.replace("http", "ws")}/ws/room/${c}`);
    window.ws = ws;
    ws.onopen = () => res();
  }), code);
  const send = (p, m) => p.evaluate((m) => window.ws.send(JSON.stringify(m)), m);
  await sock(A0);
  await sock(B0);
  await sleep(500);
  await send(A0, { t: "pick", pick: "rock" });
  await send(B0, { t: "pick", pick: "scissors" });
  await sleep(800);
  await send(A0, { t: "deploy", code: "1234" });
  await send(B0, { t: "deploy", code: "5678" });
  await sleep(800);
  const A = await A0.context().newPage();
  const B = await B0.context().newPage();
  await A0.close();
  await B0.close();
  const inBattle = (p) => p.waitForFunction(() => window.__app.screen === "match" && window.__app.view.s?.phase === "battle", null, { timeout: 120000, polling: 250 });
  const clean = (s) => s.screen === "match" && !s.place && !s.busy && !s.hots && !s.paraded && !s.plates && !s.ranks;
  // Both load together: with nobody firing, the turn clock ends the match in a few minutes.
  await Promise.all([enter(A, `/r/${code}`), enter(B, `/r/${code}`)]);
  await inBattle(A);
  await sleep(2000);
  let s = await title(A);
  check(clean(s), "the host goes straight back into the battle", s);
  await B.bringToFront();
  await at(B, "signals");
  await B.waitForFunction(() => !document.getElementById("joinSheet").hidden, null, { timeout: 60000 });
  await click(B, "joinAccept");
  await inBattle(B);
  await sleep(2000);
  s = await title(B);
  check(clean(s), "the guest accepts and goes back into the battle", s);
  await A.evaluate(() => window.__app.view.conn?.send({ t: "leave" }));
  await sleep(3000);
  await enter(B, `/r/${code}`);
  await B.waitForFunction(() => window.__app.screen === "match" || !document.getElementById("joinSheet").hidden, null, { timeout: 120000 });
  if (await B.evaluate(() => !document.getElementById("joinSheet").hidden)) await click(B, "joinAccept");
  await B.waitForFunction(() => window.__app.screen === "match" && window.__app.view.s?.phase === "over", null, { timeout: 120000, polling: 250 });
  await sleep(2000);
  s = await title(B);
  check(clean(s), "the finished match opens without the title", s);
  await click(B, "homeBtn");
  await at(B, "corner");
  s = await title(B);
  check(s.screen === "menu" && s.place === "corner" && s.paraded, "Back to base walks to the corner, the commanders back on parade", s);
}

// 4. Tutorials: over the top into a drill the enemy never fires back in, a lesson for each step,
// nothing recorded, and training again from the telephone.
{
  const p = await page(1280, 800, { name: `Drill${stamp}` });
  await enter(p);
  await at(p, "corner");
  const before = await p.evaluate(async () => (await (await fetch("/api/me")).json()).player);
  await hot(p, "Tutorials");
  // Settled once the n-th move has played out and its state has arrived.
  const ready = (n = 0) => p.waitForFunction((k) => {
    const v = window.__app.view;
    return v.s?.phase === "battle" && v.s.volleys.length + v.s.powers.length === k && !v.animating && !document.getElementById("drill").hidden;
  }, n, { timeout: 180000, polling: 250 });
  const step = () => p.evaluate(() => document.getElementById("drillStep").textContent);
  await ready();
  let s = await title(p);
  check(s.screen === "match" && !s.place && !s.paraded && (await step()).startsWith("Lesson 1 of 6"), "Tutorials climbs over the top into the drill", s);
  const secret = await p.evaluate(() => window.__app.view.conn.g.p[1].secret);
  const act = (m) => p.evaluate((x) => window.__app.view.conn.send(x), m);
  const other = [..."0123456789"].filter((d) => !secret.includes(d));
  const lessons = [];
  for (const m of [
    { t: "fire", guess: other.slice(0, 4).join("") },
    { t: "fire", guess: secret[1] + secret[0] + other[0] + other[1] },
    { t: "power", kind: "recon", digit: secret[2] },
    { t: "fire", guess: other.slice(2, 6).join("") },
    { t: "power", kind: "sniper", digit: secret[0], pos: 0 },
    { t: "fire", guess: other.slice(1, 5).join("") },
    { t: "power", kind: "smoke" },
  ]) {
    await act(m);
    await ready(lessons.length + 1);
    await sleep(300);
    lessons.push(await step());
  }
  check(lessons.map((l) => l.split(":")[0]).join() === "Lesson 2 of 6,Lesson 3 of 6,Lesson 4 of 6,Lesson 4 of 6,Lesson 5 of 6,Lesson 5 of 6,Lesson 6 of 6", "a lesson follows each step", lessons);
  const opp = await p.evaluate(() => window.__app.view.s.volleys.filter((v) => v.by === "opp").length);
  check(opp === 0, "the drill squad never fires", opp);
  await act({ t: "fire", guess: secret });
  await p.waitForFunction(() => document.body.classList.contains("told"), null, { timeout: 180000, polling: 250 });
  const end = await p.evaluate(() => ({ label: document.getElementById("rematchLabel").textContent, slip: !document.getElementById("drill").hidden }));
  check(end.label === "Train again" && !end.slip, "the drill ends with the telegram and Train again", end);
  const after = await p.evaluate(async () => (await (await fetch("/api/me")).json()).player);
  check(JSON.stringify(after) === JSON.stringify(before), "training records nothing", { before, after });
  await click(p, "rematchBtn");
  await ready();
  check((await step()).startsWith("Lesson 1 of 6") && (await p.evaluate(() => window.__app.view.s.volleys.length)) === 0, "Train again starts a fresh drill");
  await p.context().close();
}

await browser.close();
console.log(failures ? `FAIL ${failures}` : "PASS");
process.exit(failures ? 1 : 0);
