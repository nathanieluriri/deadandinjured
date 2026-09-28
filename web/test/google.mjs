// Google sign-in against a stand-in for Google on this machine, so no real account is needed: a new
// player picks a callsign and signs in on another device, Google is linked to a callsign, the
// flow's guards hold, and in the browser the dog tag and the enlist window lead through it.
//   npx wrangler dev --var GOOGLE_CLIENT_SECRET:stub-secret --var GOOGLE_STUB:http://127.0.0.1:8790
//   NODE_PATH=$(npm root -g) node test/google.mjs [http://127.0.0.1:8787]
import { createServer } from "node:http";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { createRequire } from "node:module";

const BASE = process.argv[2] || "http://127.0.0.1:8787";
const STUB = "http://127.0.0.1:8790";
const SECRET = "stub-secret";
const tag = Date.now().toString(36).slice(-5);
const fail = (m) => {
  console.error("FAIL:", m);
  process.exit(1);
};
const check = (ok, m) => ok || fail(m);
const b64u = (b) => Buffer.from(b).toString("base64url");

// The stand-in: /auth signs in as stub.account and sends the browser back with a code; /token swaps
// the code for an ID token, checking the secret, the redirect and the PKCE verifier as Google does.
const stub = { account: "", aud: null, codes: new Map() };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, STUB);
  if (url.pathname === "/auth") {
    const q = url.searchParams;
    const back = new URL(q.get("redirect_uri"));
    back.searchParams.set("state", q.get("state"));
    if (stub.account === "deny") back.searchParams.set("error", "access_denied");
    else {
      const code = b64u(randomBytes(12));
      stub.codes.set(code, { sub: stub.account, client: q.get("client_id"), redirect: q.get("redirect_uri"), challenge: q.get("code_challenge"), method: q.get("code_challenge_method"), scope: q.get("scope") });
      back.searchParams.set("code", code);
    }
    return res.writeHead(302, { Location: String(back) }).end();
  }
  if (url.pathname === "/token" && req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const f = new URLSearchParams(body);
    const c = stub.codes.get(f.get("code"));
    stub.codes.delete(f.get("code"));
    const ok = c && f.get("grant_type") === "authorization_code" && f.get("client_secret") === SECRET && f.get("client_id") === c.client &&
      f.get("redirect_uri") === c.redirect && c.method === "S256" && c.scope === "openid" &&
      b64u(createHash("sha256").update(f.get("code_verifier") || "").digest()) === c.challenge;
    if (!ok) return res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "invalid_grant" }));
    const now = Math.floor(Date.now() / 1000);
    const claims = { iss: "https://accounts.google.com", aud: stub.aud || c.client, sub: c.sub, iat: now, exp: now + 3600 };
    const idToken = [b64u(JSON.stringify({ alg: "RS256", kid: "stub" })), b64u(JSON.stringify(claims)), "c3R1Yg"].join(".");
    return res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ access_token: "stub", expires_in: 3599, token_type: "Bearer", scope: "openid", id_token: idToken }));
  }
  res.writeHead(404).end();
});
await new Promise((ok) => server.listen(Number(new URL(STUB).port), "127.0.0.1", ok));

// A browser without the browser: a cookie jar and redirects followed one hop at a time.
function device() {
  const jar = new Map();
  const send = async (url, init = {}) => {
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await fetch(url, { ...init, redirect: "manual", headers: { ...init.headers, Cookie: cookie } });
    for (const c of res.headers.getSetCookie()) {
      const pair = c.split(";")[0];
      const k = pair.slice(0, pair.indexOf("="));
      if (/Max-Age=0\b/i.test(c)) jar.delete(k);
      else jar.set(k, pair.slice(k.length + 1));
    }
    return res;
  };
  const post = async (path, body) => {
    const r = await send(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: r.status, data: await r.json() };
  };
  const google = async (account, mode = "in", next = "/") => {
    stub.account = account;
    const start = await send(`${BASE}/api/auth/google?${new URLSearchParams({ mode, next })}`);
    const back = await send(start.headers.get("location"));
    return (await send(back.headers.get("location"))).headers.get("location");
  };
  const me = async () => (await (await send(`${BASE}/api/me`)).json()).player;
  return { jar, send, post, google, me };
}

const ends = (loc, path, result) => {
  const u = new URL(loc);
  return u.origin === new URL(BASE).origin && u.pathname === path && u.searchParams.get("google") === result;
};

// The way out: state, PKCE and a short-lived cookie that only the flow's paths see.
{
  const r = await device().send(`${BASE}/api/auth/google?next=/r/ABCDE`);
  const to = new URL(r.headers.get("location"));
  const q = to.searchParams;
  check(r.status === 302 && `${to.origin}${to.pathname}` === `${STUB}/auth`, `start goes to ${to}`);
  check(q.get("redirect_uri") === `${BASE}/api/auth/google/callback`, `redirect_uri ${q.get("redirect_uri")}`);
  check(q.get("scope") === "openid" && q.get("code_challenge_method") === "S256" && q.get("state").length >= 20 && q.get("code_challenge").length === 43, `start params ${q}`);
  const flow = r.headers.getSetCookie().find((c) => c.startsWith("di_o="));
  check(/HttpOnly/.test(flow) && /SameSite=Lax/.test(flow) && /Path=\/api\/auth\/google;/.test(flow) && /Max-Age=600/.test(flow), `flow cookie ${flow}`);
  console.log("start: state, PKCE and the flow cookie");
}

// A new Google account picks a callsign, then Google signs it in on another device.
const A = device();
check(ends(await A.google(`g1-${tag}`), "/", "new"), "a new account is not sent to pick a callsign");
check(A.jar.has("di_g") && !A.jar.has("di_o"), "the pending cookie is missing or the flow cookie stayed");
let r = await A.post("/api/enlist", { name: `G${tag}A` });
check(r.status === 201 && r.data.linked && r.data.player.google && r.data.player.secured, `enlist with Google: ${JSON.stringify(r)}`);
check(!A.jar.has("di_g"), "the pending cookie stayed after linking");
const B = device();
check(ends(await B.google(`g1-${tag}`), "/", "in"), "a known account is not signed in");
check((await B.me())?.name === `G${tag}A`, "the second device is not signed in as the callsign");
console.log("a new account enlists, then signs in on another device");

// Linking Google to a callsign that lives in one browser, and one Google account per callsign.
const C = device();
r = await C.post("/api/enlist", { name: `G${tag}C` });
check(r.status === 201 && !r.data.linked && !r.data.player.google && !r.data.player.secured, `plain enlist: ${JSON.stringify(r)}`);
check(ends(await C.google(`g3-${tag}`, "link"), "/", "linked") && (await C.me()).google, "link");
check(ends(await C.google(`g3-${tag}`, "link"), "/", "linked"), "linking the same account again");
check(ends(await C.google(`g1-${tag}`, "link"), "/", "taken"), "linking another callsign's account");
check(ends(await C.google(`g5-${tag}`, "link"), "/", "has"), "linking a second account");
const D = device();
check(ends(await D.google(`g3-${tag}`), "/", "in") && (await D.me()).name === `G${tag}C`, "the linked account does not sign in");
const I = device();
check(ends(await I.google(`g1-${tag}`, "link"), "/", "in") && (await I.me()).name === `G${tag}A`, "link without a callsign is not a sign in");
console.log("link, link again, taken, one account per callsign");

// A new Google account joins the callsign its owner then signs into with a password.
const F = device();
await F.post("/api/enlist", { name: `G${tag}F` });
const pw = `pw-${tag}-secret`;
check((await F.post("/api/password", { password: pw })).status === 200, "password not saved");
const G = device();
check(ends(await G.google(`g7-${tag}`), "/", "new"), "new account for the password callsign");
r = await G.post("/api/login", { name: `G${tag}F`, password: pw });
check(r.status === 200 && r.data.linked && r.data.player.google && r.data.player.name === `G${tag}F`, `login with a pending account: ${JSON.stringify(r)}`);
const H = device();
check(ends(await H.google(`g7-${tag}`), "/", "in") && (await H.me()).name === `G${tag}F`, "the password callsign does not sign in with Google");
console.log("a pending account joins the callsign signed into with a password");

// The guards.
const E = device();
check(ends(await E.google("deny"), "/", "cancel"), "cancelled at Google");
{
  stub.account = `g9-${tag}`;
  const start = await E.send(`${BASE}/api/auth/google`);
  const back = new URL((await E.send(start.headers.get("location"))).headers.get("location"));
  back.searchParams.set("state", "forged-state-forged-state");
  check(ends((await E.send(String(back))).headers.get("location"), "/", "fail"), "a forged state was accepted");
}
check(ends((await device().send(`${BASE}/api/auth/google/callback?code=x&state=y`)).headers.get("location"), "/", "fail"), "a callback with no flow was accepted");
{
  stub.account = `g9-${tag}`;
  const start = await E.send(`${BASE}/api/auth/google`);
  const [s, v, m, n] = E.jar.get("di_o").split(".");
  E.jar.set("di_o", [s, `${v.slice(0, -1)}${v.endsWith("A") ? "B" : "A"}`, m, n].join("."));
  const back = await E.send(start.headers.get("location"));
  check(ends((await E.send(back.headers.get("location"))).headers.get("location"), "/", "fail"), "a wrong PKCE verifier was accepted");
}
stub.aud = "someone-else.apps.googleusercontent.com";
check(ends(await E.google(`g9-${tag}`), "/", "fail"), "an ID token for another client was accepted");
stub.aud = null;
for (const [name, value] of [
  ["forged", `g1-${tag}.${Date.now() + 600e3}.${b64u(randomBytes(32))}`],
  ["expired", (() => {
    const body = `g1-${tag}.${Date.now() - 1000}`;
    return `${body}.${createHmac("sha256", SECRET).update(`pending.${body}`).digest("base64url")}`;
  })()],
]) {
  const X = device();
  X.jar.set("di_g", value);
  r = await X.post("/api/enlist", { name: `G${tag}${name.slice(0, 3)}` });
  check(r.status === 201 && !r.data.linked && !r.data.player.google, `a ${name} pending cookie linked Google`);
}
for (const next of ["https://evil.example/", "//evil.example", "/r/ABCDE/../../x", "/api/me"]) {
  check(ends(await device().google("deny", "in", next), "/", "cancel"), `next ${next} left the site`);
}
check(ends(await device().google("deny", "in", "/r/ABCDE"), "/r/ABCDE", "cancel"), "a room link was not kept");
console.log("guards: cancel, forged state, no flow, wrong verifier, wrong audience, forged and expired pending cookies, open redirects");

// In the browser: the dog tag's Sign in with Google, a callsign for the new account, then the enlist
// window's Continue with Google on another browser, and a friend's room link kept through Google.
const { chromium } = createRequire(import.meta.url)("playwright");
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });

async function enter(page) {
  await page.waitForFunction(() => !document.getElementById("enterBtn").disabled, null, { timeout: 120000 });
  await page.click("#enterBtn");
}

async function open(path = "/") {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
  await ctx.addInitScript(() => localStorage.setItem("di.intro", "1"));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fail(`page error: ${e.message}`));
  await page.goto(`${BASE}${path}${path.includes("?") ? "&" : "?"}nolag`, { waitUntil: "load" });
  await enter(page);
  return page;
}

// Pressed from inside the page, after the evaluate returns, since the press leaves the page.
const leave = async (page, sel) => {
  const back = page.waitForURL(/google=/, { timeout: 30000 });
  await page.evaluate((s) => setTimeout(() => document.querySelector(s).click(), 0), sel);
  await back;
  await enter(page);
};

const toasted = (page, text) => page.waitForFunction((t) => document.getElementById("toast").textContent.includes(t), text, { timeout: 15000, polling: 100 });
const atCorner = (page) => page.waitForFunction(() => document.body.dataset.place === "corner" && !window.__app.title.busy, null, { timeout: 60000, polling: 100 });

const p1 = await open();
await atCorner(p1);
await p1.evaluate(() => document.querySelector("#hots .hot[aria-label='Your dog tag']").click());
check(await p1.textContent('#who [data-act="google"]') === "Sign in with Google", "the dog tag has no Sign in with Google");
stub.account = `g11-${tag}`;
await leave(p1, '#who [data-act="google"]');
await p1.waitForSelector("#enlistDlg[open]", { timeout: 60000 });
check(new URL(p1.url()).search === "?nolag" || new URL(p1.url()).search === "", `the result stayed in the address: ${p1.url()}`);
check((await p1.textContent("#enlistText")).includes("Google account is ready") && await p1.isHidden("#enlistGoogle"), "the enlist window does not say the Google account is ready");
await p1.fill("#enlistName", `G${tag}W`);
await p1.click("#enlistGo");
await toasted(p1, "Google linked");
check((await p1.evaluate(() => window.__app.me)).google, "the new account is not linked");
check(!(await p1.$('#who [data-act="google"]')) && !!(await p1.$('#who [data-act="signout"]')), "the dog tag still offers Google or has no Sign out");
console.log("browser: Sign in with Google on the dog tag, then a callsign for the new account");
await p1.context().close();

const p2 = await open();
await atCorner(p2);
await p2.evaluate(() => {
  window.__app.needCallsign(true);
});
await p2.waitForSelector("#enlistDlg[open]");
check(await p2.isVisible("#enlistGoogle [data-google]"), "the sign in window has no Continue with Google");
await leave(p2, "#enlistGoogle [data-google]");
await toasted(p2, `Signed in as G${tag}W`);
check((await p2.evaluate(() => window.__app.me?.name)) === `G${tag}W`, "Continue with Google did not sign in");
console.log("browser: Continue with Google signs in on another browser");
await p2.context().close();

const p3 = await open("/r/ABCDE");
await p3.waitForSelector("#enlistDlg[open]", { timeout: 60000 });
const callback = p3.waitForResponse((res) => res.url().includes("/api/auth/google/callback"));
stub.account = `g12-${tag}`;
await leave(p3, "#enlistGoogle [data-google]");
check(new URL((await callback).headers().location).pathname === "/r/ABCDE", "Google did not come back to the friend's room link");
await p3.waitForSelector("#enlistDlg[open]", { timeout: 60000 });
check((await p3.textContent("#enlistText")).includes("Google account is ready"), "back at the room link, the enlist window does not say the Google account is ready");
console.log("browser: a friend's room link is kept through Google");

await browser.close();
server.close();
console.log("PASS");
