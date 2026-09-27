export const LEN = 4;
export const RPS = ["rock", "paper", "scissors"];
export const POWERS = ["recon", "sniper", "smoke"];
export const POWER_NAMES = { recon: "Recon", sniper: "Sniper", smoke: "Smoke" };

// A player's orders: the rules they bring to a match. The standard orders are the game as it
// always was, plus a time limit.
export const STANDARD_ORDERS = Object.freeze({ recon: true, sniper: true, smoke: true, crates: 3, minutes: 10 });
export const MINUTES = [5, 10, 15];
export const TURN_SECONDS = { 5: 30, 10: 45, 15: 60 };

export function cleanOrders(o) {
  const s = STANDARD_ORDERS;
  if (typeof o === "string") o = parseOrders(o);
  if (!o || typeof o !== "object") return { ...s };
  const flag = (v, d) => (typeof v === "boolean" ? v : d);
  const crates = Number(o.crates);
  const minutes = Number(o.minutes);
  return {
    recon: flag(o.recon, s.recon),
    sniper: flag(o.sniper, s.sniper),
    smoke: flag(o.smoke, s.smoke),
    crates: Number.isFinite(crates) ? Math.max(1, Math.min(5, Math.round(crates))) : s.crates,
    minutes: MINUTES.includes(minutes) ? minutes : s.minutes,
  };
}

export const anySupply = (o) => !!(o && (o.recon || o.sniper || o.smoke));

// Six characters, safe in a URL: the three supply switches, the crates, then the minutes.
export function packOrders(o) {
  const c = cleanOrders(o);
  return `${+c.recon}${+c.sniper}${+c.smoke}${c.crates}${String(c.minutes).padStart(2, "0")}`;
}

export function parseOrders(str) {
  const m = /^([01])([01])([01])([1-5])(05|10|15)$/.exec(String(str || ""));
  if (!m) return null;
  return { recon: m[1] === "1", sniper: m[2] === "1", smoke: m[3] === "1", crates: Number(m[4]), minutes: Number(m[5]) };
}

export function randomOrders(rng = Math.random) {
  return {
    recon: rng() < 0.5, sniper: rng() < 0.5, smoke: rng() < 0.5,
    crates: 1 + Math.floor(rng() * 5),
    minutes: MINUTES[Math.floor(rng() * MINUTES.length)],
  };
}

export function isCode(s) {
  return typeof s === "string" && /^[0-9]{4}$/.test(s) && new Set(s).size === LEN;
}

export function score(guess, secret) {
  let dead = 0;
  let injured = 0;
  for (let i = 0; i < LEN; i++) {
    if (guess[i] === secret[i]) dead++;
    else if (secret.includes(guess[i])) injured++;
  }
  return { dead, injured };
}

// 1 when a beats b, -1 when b beats a, 0 on a draw.
export function rps(a, b) {
  if (a === b) return 0;
  const beats = { rock: "scissors", paper: "rock", scissors: "paper" };
  return beats[a] === b ? 1 : -1;
}

export function randomCode(rng = Math.random) {
  const d = [..."0123456789"];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d.slice(0, LEN).join("");
}

let every;
export function allCodes() {
  if (every) return every;
  every = [];
  for (let n = 0; n < 10000; n++) {
    const s = String(n).padStart(4, "0");
    if (isCode(s)) every.push(s);
  }
  return every;
}

export const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _-]{1,14}[A-Za-z0-9]$/;
export function cleanName(s) {
  return String(s || "").trim().replace(/\s+/g, " ");
}

const ROOM_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function roomCode(rng = Math.random) {
  let s = "";
  for (let i = 0; i < 5; i++) s += ROOM_ALPHABET[Math.floor(rng() * ROOM_ALPHABET.length)];
  return s;
}
export const ROOM_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/;
