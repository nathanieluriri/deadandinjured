const enc = new TextEncoder();

/** Journey order for this activation. Later steps need the ones before them. */
export const IQLY_STEPS = [
  { event: "create-website-account", step: 0 },
  { event: "play-a-match-or-round", step: 1 },
  { event: "win-a-match-or-round", step: 2 },
  { event: "play-with-another-person", step: 3 },
];

const COOKIE = "di_iq";
const CODE_RE = /^IQ-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4,12}$/i;

export function cleanCode(raw) {
  const value = String(raw || "").trim().toUpperCase();
  return CODE_RE.test(value) ? value : "";
}

export function readCode(req) {
  const m = (req.headers.get("Cookie") || "").match(/(?:^|;\s*)di_iq=([^;]+)/);
  return cleanCode(m ? decodeURIComponent(m[1]) : "");
}

export function codeCookie(code, url) {
  const secure = url.protocol === "https:" ? "; Secure" : "";
  if (!code) return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
  return `${COOKIE}=${encodeURIComponent(code)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${secure}`;
}

export function eventsForMatch({ kind, result }) {
  const earned = ["create-website-account", "play-a-match-or-round"];
  if (result === "win") earned.push("win-a-match-or-round");
  if (kind === "multi" && (result === "win" || result === "loss")) {
    earned.push("play-with-another-person");
  }
  return earned;
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function postbackBody({ code, step, event, txnId, ts }) {
  return JSON.stringify({
    code,
    step,
    event,
    txn_id: txnId,
    ts,
  });
}

export async function bindCode(env, playerId, code) {
  const clean = cleanCode(code);
  if (!clean || !playerId) return "";
  await env.DB.prepare(
    "UPDATE players SET iqly_code = COALESCE(iqly_code, ?1) WHERE id = ?2",
  ).bind(clean, playerId).run();
  return clean;
}

export async function codeOf(env, playerId, fallback = "") {
  if (!playerId) return cleanCode(fallback);
  try {
    const row = await env.DB.prepare("SELECT iqly_code FROM players WHERE id = ?1").bind(playerId).first();
    return cleanCode(row?.iqly_code) || cleanCode(fallback);
  } catch {
    return cleanCode(fallback);
  }
}

async function alreadySent(env, playerId, event) {
  try {
    const row = await env.DB.prepare(
      "SELECT event FROM iqly_events WHERE player_id = ?1 AND event = ?2",
    ).bind(playerId, event).first();
    return !!row;
  } catch {
    return false;
  }
}

async function markSent(env, playerId, event, txnId, status) {
  try {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO iqly_events (player_id, event, txn_id, sent_at, status) VALUES (?1, ?2, ?3, ?4, ?5)",
    ).bind(playerId, event, txnId, Date.now(), status || "sent").run();
  } catch (e) {
    console.error("iqly mark", event, e);
  }
}

async function sendOne(env, { code, step, event, txnId }) {
  const secret = env.IQLY_SECRET;
  const key = env.IQLY_KEY;
  const url = env.IQLY_POSTBACK_URL;
  if (!secret || !key || !url) return "skipped";
  const body = postbackBody({
    code,
    step,
    event,
    txnId,
    ts: Math.floor(Date.now() / 1000),
  });
  const signature = await hmacHex(secret, body);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Iqly-Key": key,
      "X-Iqly-Signature": signature,
    },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("iqly postback", event, res.status, text.slice(0, 200));
    return `http-${res.status}`;
  }
  return "ok";
}

/**
 * Send earned steps in order. A later step is skipped until the one before
 * it has already gone out, so a loss never jumps over a win.
 */
export async function report(env, { playerId, earned, txnStem, code }) {
  if (!playerId || !env?.IQLY_SECRET || !env?.IQLY_KEY) return;
  const iqlyCode = await codeOf(env, playerId, code);
  if (!iqlyCode) return;
  const want = new Set(earned || []);
  const have = new Set();
  for (const item of IQLY_STEPS) {
    if (await alreadySent(env, playerId, item.event)) have.add(item.event);
  }
  for (const item of IQLY_STEPS) {
    if (!want.has(item.event) || have.has(item.event)) continue;
    if (item.step > 0 && !have.has(IQLY_STEPS[item.step - 1].event)) continue;
    const txnId = `${txnStem}-${item.event}`.slice(0, 120);
    const status = await sendOne(env, {
      code: iqlyCode,
      step: item.step,
      event: item.event,
      txnId,
    });
    if (status === "ok" || status === "skipped") {
      await markSent(env, playerId, item.event, txnId, status);
      have.add(item.event);
    }
  }
}

export function afterAccount(env, ctx, { playerId, code }) {
  const task = report(env, {
    playerId,
    earned: ["create-website-account"],
    txnStem: `dai-${playerId}-account`,
    code,
  });
  if (ctx?.waitUntil) ctx.waitUntil(task);
  else return task;
}

export function afterMatch(env, ctx, { playerId, kind, result, matchId, code }) {
  const task = report(env, {
    playerId,
    earned: eventsForMatch({ kind, result }),
    txnStem: `dai-${playerId}-${matchId || "match"}`,
    code,
  });
  if (ctx?.waitUntil) ctx.waitUntil(task);
  else return task;
}
