export const LEN = 4;
export const RPS = ["rock", "paper", "scissors"];
export const POWERS = ["recon", "sniper", "smoke"];
export const SUPPLIES = { win: 3, lose: 2 };

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
