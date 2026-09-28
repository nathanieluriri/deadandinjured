import { b64u, random, sha256, same, currentPlayer, startSession, cookieFor } from "./auth.js";

const FLOW = "di_o";
const PENDING = "di_g";
const PENDING_MINUTES = 15;
const NEXT_RE = /^\/(r\/[A-Za-z0-9]{5})?$/;
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const enc = new TextEncoder();

// GOOGLE_STUB points the flow at a local stand-in for Google, for tests only.
const endpoints = (env) => env.GOOGLE_STUB
  ? { auth: `${env.GOOGLE_STUB}/auth`, token: `${env.GOOGLE_STUB}/token` }
  : { auth: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token" };

export const googleReady = (env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

const callbackUrl = (url) => `${url.origin}/api/auth/google/callback`;
const cleanNext = (s) => (NEXT_RE.test(s || "") ? s : "/");

function readCookie(req, name) {
  const m = (req.headers.get("Cookie") || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? m[1] : "";
}

function cookie(name, value, url, path, minutes = 0) {
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return `${name}=${value}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${value ? minutes * 60 : 0}${secure}`;
}

export const clearPending = (url) => cookie(PENDING, "", url, "/api");

function back(url, next, result, ...cookies) {
  const headers = new Headers({ Location: `${url.origin}${next}?google=${result}`, "Cache-Control": "no-store" });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers });
}

export async function googleStart(req, env, url) {
  const next = cleanNext(url.searchParams.get("next"));
  if (!googleReady(env)) return back(url, next, "off");
  const mode = url.searchParams.get("mode") === "link" ? "link" : "in";
  const state = random(16);
  const verifier = random(32);
  const to = new URL(endpoints(env).auth);
  to.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID, redirect_uri: callbackUrl(url), response_type: "code", scope: "openid",
    state, code_challenge: await sha256(verifier), code_challenge_method: "S256", prompt: "select_account",
  });
  const flow = cookie(FLOW, [state, verifier, mode, next].join("."), url, "/api/auth/google", 10);
  return new Response(null, { status: 302, headers: { Location: String(to), "Cache-Control": "no-store", "Set-Cookie": flow } });
}

export async function googleCallback(req, env, url) {
  const [state, verifier, mode, saved] = readCookie(req, FLOW).split(".");
  const next = cleanNext(saved);
  const done = cookie(FLOW, "", url, "/api/auth/google");
  const q = url.searchParams;
  if (q.get("error")) return back(url, next, q.get("error") === "access_denied" ? "cancel" : "fail", done);
  if (!state || !verifier || q.get("state") !== state || !q.get("code")) return back(url, next, "fail", done);
  try {
    const sub = await googleAccount(env, url, q.get("code"), verifier);
    if (!sub) return back(url, next, "fail", done);
    const owner = await env.DB.prepare("SELECT id FROM players WHERE google = ?1").bind(sub).first();
    const me = mode === "link" ? await currentPlayer(req, env) : null;
    if (me) {
      if (owner) return back(url, next, owner.id === me.id ? "linked" : "taken", done);
      return back(url, next, (await linkGoogle(env, me.id, sub)) ? "linked" : "has", done);
    }
    if (owner) return back(url, next, "in", done, cookieFor(await startSession(env, owner.id), url));
    return back(url, next, "new", done, cookie(PENDING, await seal(env, sub), url, "/api", PENDING_MINUTES));
  } catch (e) {
    console.error(e);
    return back(url, next, "fail", done);
  }
}

async function googleAccount(env, url, code, verifier) {
  const r = await fetch(endpoints(env).token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, code_verifier: verifier, grant_type: "authorization_code", redirect_uri: callbackUrl(url),
      client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
    }),
  });
  if (!r.ok) {
    console.error("google token", r.status, await r.text());
    return null;
  }
  const { id_token: idToken } = await r.json();
  // The ID token came straight from Google's token endpoint over TLS in exchange for the client
  // secret, so its signature needs no check (OpenID Connect Core 3.1.3.7).
  const claims = JSON.parse(atob(String(idToken).split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  const valid = ISSUERS.includes(claims.iss) && claims.aud === env.GOOGLE_CLIENT_ID && claims.exp * 1000 > Date.now();
  return valid && typeof claims.sub === "string" && claims.sub ? claims.sub : null;
}

export async function linkGoogle(env, playerId, sub) {
  const r = await env.DB.prepare(
    "UPDATE players SET google = ?1 WHERE id = ?2 AND google IS NULL AND NOT EXISTS (SELECT 1 FROM players WHERE google = ?1)",
  ).bind(sub, playerId).run();
  return r.meta.changes > 0;
}

async function sign(env, body) {
  const key = await crypto.subtle.importKey("raw", enc.encode(env.GOOGLE_CLIENT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", key, enc.encode(`pending.${body}`)));
}

async function seal(env, sub) {
  const body = `${sub}.${Date.now() + PENDING_MINUTES * 60e3}`;
  return `${body}.${await sign(env, body)}`;
}

// A Google account new to the game, waiting to be linked when its owner enlists or signs in.
export async function pendingGoogle(req, env) {
  const [sub, until, sig] = readCookie(req, PENDING).split(".");
  if (!sig || !googleReady(env) || !(Number(until) > Date.now())) return null;
  return same(sig, await sign(env, `${sub}.${until}`)) ? sub : null;
}
