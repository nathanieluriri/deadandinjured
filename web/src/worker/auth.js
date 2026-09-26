import { NAME_RE, cleanName } from "../shared/rules.js";

const COOKIE = "di_s";
const SESSION_DAYS = 180;
// Workers on the free plan get 10 ms of CPU per request; 25k rounds of PBKDF2 take about 5 ms.
// The pepper (a Worker secret) keeps a leaked table from being cracked offline.
const ROUNDS = 25000;
const enc = new TextEncoder();

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const random = (n) => b64u(crypto.getRandomValues(new Uint8Array(n)));
const sha256 = async (s) => b64u(await crypto.subtle.digest("SHA-256", enc.encode(s)));

async function pbkdf2(password, salt, rounds, pepper) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt + pepper), iterations: rounds }, key, 256);
  return b64u(bits);
}

function same(a, b) {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

export async function hashPassword(password, env) {
  const salt = random(16);
  return `pbkdf2$${ROUNDS}$${salt}$${await pbkdf2(password, salt, ROUNDS, env.PEPPER || "")}`;
}

async function checkPassword(password, stored, env) {
  const [kind, rounds, salt, hash] = String(stored || "").split("$");
  if (kind !== "pbkdf2" || !hash) return false;
  return same(await pbkdf2(password, salt, Number(rounds), env.PEPPER || ""), hash);
}

function readCookie(req) {
  const m = (req.headers.get("Cookie") || "").match(/(?:^|;\s*)di_s=([A-Za-z0-9_-]{20,})/);
  return m ? m[1] : null;
}

export function cookieFor(token, url) {
  const secure = url.protocol === "https:" ? "; Secure" : "";
  if (!token) return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`;
}

export async function currentPlayer(req, env) {
  const token = readCookie(req);
  if (!token) return null;
  return env.DB.prepare(
    "SELECT p.* FROM sessions s JOIN players p ON p.id = s.player_id WHERE s.token_hash = ?1 AND s.expires_at > ?2",
  ).bind(await sha256(token), Date.now()).first();
}

export async function startSession(env, playerId) {
  const token = random(32);
  const now = Date.now();
  await env.DB.prepare("INSERT INTO sessions (token_hash, player_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)")
    .bind(await sha256(token), playerId, now, now + SESSION_DAYS * 86400e3).run();
  return token;
}

export async function endSession(req, env) {
  const token = readCookie(req);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(await sha256(token)).run();
}

export function checkName(raw) {
  const name = cleanName(raw);
  if (!NAME_RE.test(name)) return { error: "Callsigns are 3 to 16 letters, digits, spaces, _ or -" };
  return { name, key: name.toLowerCase() };
}

export async function enlist(env, raw) {
  const n = checkName(raw);
  if (n.error) return n;
  const id = random(12);
  const r = await env.DB.prepare("INSERT OR IGNORE INTO players (id, name, name_key, created_at) VALUES (?1, ?2, ?3, ?4)")
    .bind(id, n.name, n.key, Date.now()).run();
  if (!r.meta.changes) return { error: "That callsign is taken. Sign in if it is yours." };
  return { id };
}

export async function login(env, raw, password) {
  const n = checkName(raw);
  if (n.error) return { error: "Wrong callsign or password" };
  const p = await env.DB.prepare("SELECT id, pass_hash FROM players WHERE name_key = ?1").bind(n.key).first();
  if (!p || !p.pass_hash || !(await checkPassword(String(password || ""), p.pass_hash, env))) return { error: "Wrong callsign or password" };
  return { id: p.id };
}

export function publicPlayer(p) {
  if (!p) return null;
  return {
    id: p.id, name: p.name, secured: !!p.pass_hash,
    wins: p.wins, losses: p.losses, draws: p.draws, kills: p.kills, best: p.best,
    soloWins: p.solo_wins, soloLosses: p.solo_losses,
  };
}
