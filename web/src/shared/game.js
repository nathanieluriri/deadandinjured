// The match engine. Pure functions over a plain JSON state, shared by the Room Durable Object
// (live matches) and the browser (matches against the computer). Every function that changes
// the state returns a list of [seat, event] pairs for the caller to deliver.
import { isCode, score, rps, randomCode, RPS, POWERS, SUPPLIES } from "./rules.js";

export const TIMES = {
  lobby: 3 * 60e3,
  supply: 30e3,
  deploy: 75e3,
  turn: 60e3,
  graceRps: 4200,
  graceBattle: 2500,
  graceVolley: 5600,
  maxTimeouts: 3,
};

const seatOf = (u) => ({
  id: u.id, name: u.name, joined: false, pick: null, secret: null,
  supplies: 0, powerAt: -1, smoke: false, timeouts: 0,
});

export function newGame({ code, host, guest = null, now, timers = true }) {
  return {
    code, created: now, timers,
    p: [seatOf(host), guest ? seatOf(guest) : null],
    phase: "lobby",
    rpsRound: 0,
    first: 0, turn: 0, round: 1, lastStand: false,
    volleys: [], powers: [],
    deadline: timers ? now + TIMES.lobby : null,
    result: null, rematch: [false, false], match: 1, started: null, recorded: false,
  };
}

const later = (g, now, ms) => (g.timers ? now + ms : null);
const err = (msg) => ({ error: msg, events: [] });

export function join(g, id, name, now) {
  let s = g.p.findIndex((p) => p && p.id === id);
  if (s < 0) {
    if (g.p[1] || g.phase !== "lobby") return err("This room is already full");
    g.p[1] = seatOf({ id, name });
    s = 1;
  }
  const ev = [];
  if (!g.p[s].joined) {
    g.p[s].joined = true;
    ev.push([1 - s, { t: "joined", name: g.p[s].name }]);
  }
  if (g.phase === "lobby" && g.p[0]?.joined && g.p[1]?.joined) startSupply(g, now, ev);
  return { seat: s, events: ev };
}

function startSupply(g, now, ev) {
  g.phase = "supply";
  g.deadline = later(g, now, 1500 + TIMES.supply);
  for (const s of [0, 1]) ev.push([s, { t: "supply" }]);
}

function resolveRps(g, now, ev) {
  const [a, b] = [g.p[0].pick, g.p[1].pick];
  const r = rps(a, b);
  g.rpsRound++;
  if (r === 0) {
    for (const s of [0, 1]) ev.push([s, { t: "rps", me: g.p[s].pick, opp: g.p[1 - s].pick, result: "draw" }]);
    g.p[0].pick = g.p[1].pick = null;
    g.deadline = later(g, now, TIMES.graceRps + TIMES.supply);
    return;
  }
  const w = r === 1 ? 0 : 1;
  g.p[w].supplies = SUPPLIES.win;
  g.p[1 - w].supplies = SUPPLIES.lose;
  g.first = 1 - w;
  g.turn = g.first;
  for (const s of [0, 1]) {
    ev.push([s, {
      t: "rps", me: g.p[s].pick, opp: g.p[1 - s].pick, result: s === w ? "win" : "lose",
      supplies: { me: g.p[s].supplies, opp: g.p[1 - s].supplies }, first: g.first === s ? "me" : "opp",
    }]);
  }
  g.phase = "deploy";
  g.deadline = later(g, now, TIMES.graceRps + TIMES.deploy);
}

function startBattle(g, now, ev) {
  g.phase = "battle";
  g.turn = g.first;
  g.round = 1;
  g.lastStand = false;
  g.started = now;
  g.deadline = later(g, now, TIMES.graceBattle + TIMES.turn);
  for (const s of [0, 1]) ev.push([s, { t: "battle", first: g.first === s ? "me" : "opp" }]);
}

function volleyView(v, s) {
  const by = v.by === s ? "me" : "opp";
  if (v.miss) return { by, miss: true, round: v.round };
  if (by === "me" && v.smoked) return { by, guess: v.guess, hits: v.dead + v.injured, smoked: true, round: v.round };
  return { by, guess: v.guess, dead: v.dead, injured: v.injured, smoked: v.smoked, round: v.round };
}

function resultView(g, s) {
  const w = g.result.winner;
  return {
    winner: w === -1 ? "draw" : w == null ? "none" : w === s ? "me" : "opp",
    reason: g.result.reason,
    codes: { me: g.p[s]?.secret || null, opp: g.p[1 - s]?.secret || null },
  };
}

function finish(g, winner, reason, now, ev) {
  g.phase = "over";
  g.result = { winner, reason, at: now };
  g.deadline = null;
  for (const s of [0, 1]) ev.push([s, { t: "over", ...resultView(g, s) }]);
}

function volley(g, s, guess, now, ev) {
  const o = 1 - s;
  const opp = g.p[o];
  let v;
  if (guess) {
    const { dead, injured } = score(guess, opp.secret);
    v = { by: s, guess, dead, injured, smoked: opp.smoke && dead < 4, round: g.round };
    opp.smoke = false;
  } else {
    v = { by: s, miss: true, round: g.round };
  }
  g.volleys.push(v);
  ev.push([s, { t: "volley", ...volleyView(v, s) }]);
  ev.push([o, { t: "volley", ...volleyView(v, o) }]);

  const cracked = v.dead === 4;
  if (cracked && s === g.first) {
    g.lastStand = true;
    g.turn = o;
    g.deadline = later(g, now, TIMES.graceVolley + TIMES.turn);
    for (const x of [0, 1]) ev.push([x, { t: "laststand", by: x === s ? "me" : "opp" }]);
    return;
  }
  if (cracked) return finish(g, g.lastStand ? -1 : s, "cracked", now, ev);
  if (s !== g.first) {
    if (g.lastStand) return finish(g, g.first, "cracked", now, ev);
    g.round++;
  }
  g.turn = o;
  g.deadline = later(g, now, TIMES.graceVolley + TIMES.turn);
}

function reset(g, now, ev) {
  for (const p of g.p) Object.assign(p, { pick: null, secret: null, supplies: 0, powerAt: -1, smoke: false, timeouts: 0 });
  Object.assign(g, {
    rpsRound: 0, first: 0, turn: 0, round: 1, lastStand: false, volleys: [], powers: [],
    result: null, rematch: [false, false], match: g.match + 1, started: null, recorded: false,
  });
  for (const s of [0, 1]) ev.push([s, { t: "restart" }]);
  startSupply(g, now, ev);
}

export function act(g, s, msg, now, rng = Math.random) {
  const ev = [];
  const me = g.p[s];
  const o = 1 - s;
  const opp = g.p[o];
  if (!me) return err("Not in this room");
  switch (msg && msg.t) {
    case "pick": {
      if (g.phase !== "supply") return err("Not now");
      if (!RPS.includes(msg.pick)) return err("Pick rock, paper or scissors");
      if (me.pick) return err("Already picked");
      me.pick = msg.pick;
      ev.push([o, { t: "picked" }]);
      if (opp.pick) resolveRps(g, now, ev);
      return { events: ev };
    }
    case "deploy": {
      if (g.phase !== "deploy") return err("Not now");
      if (!isCode(msg.code)) return err("Four different digits");
      if (me.secret) return err("Your code is already locked");
      me.secret = msg.code;
      ev.push([o, { t: "ready" }]);
      if (opp.secret) startBattle(g, now, ev);
      return { events: ev };
    }
    case "power": {
      if (g.phase !== "battle" || g.turn !== s) return err("Not your turn");
      if (!POWERS.includes(msg.kind)) return err("Unknown supply");
      if (me.supplies < 1) return err("No supplies left");
      if (me.powerAt === g.volleys.length) return err("One supply per turn");
      let args = null;
      let result = true;
      if (msg.kind === "recon") {
        const d = String(msg.digit);
        if (!/^[0-9]$/.test(d)) return err("Pick a digit");
        args = { digit: d };
        result = opp.secret.includes(d);
      } else if (msg.kind === "sniper") {
        const d = String(msg.digit);
        const pos = Number(msg.pos);
        if (!/^[0-9]$/.test(d) || !Number.isInteger(pos) || pos < 0 || pos > 3) return err("Pick a digit and a position");
        args = { digit: d, pos };
        result = opp.secret[pos] === d;
      } else {
        if (me.smoke) return err("Your smoke is already up");
        me.smoke = true;
      }
      me.supplies--;
      me.powerAt = g.volleys.length;
      g.powers.push({ by: s, kind: msg.kind, args, result, at: g.volleys.length });
      ev.push([s, { t: "power", by: "me", kind: msg.kind, args, result }]);
      ev.push([o, { t: "power", by: "opp", kind: msg.kind }]);
      if (g.timers) g.deadline = Math.max(g.deadline, now + 20e3);
      return { events: ev };
    }
    case "fire": {
      if (g.phase !== "battle" || g.turn !== s) return err("Not your turn");
      if (!isCode(msg.guess)) return err("Four different digits");
      me.timeouts = 0;
      volley(g, s, msg.guess, now, ev);
      return { events: ev };
    }
    case "rematch": {
      if (g.phase !== "over") return err("Not now");
      if (!opp || !["cracked", "timeout", "left"].includes(g.result.reason)) return err("No rematch for this one");
      g.rematch[s] = true;
      ev.push([o, { t: "rematch" }]);
      if (g.rematch[0] && g.rematch[1]) reset(g, now, ev);
      return { events: ev };
    }
    case "leave": {
      if (g.phase === "over") return { events: ev };
      if (g.phase === "lobby") finish(g, null, "cancelled", now, ev);
      else finish(g, o, "left", now, ev);
      return { events: ev };
    }
    default:
      return err("Unknown message");
  }
}

// Deadlines: an unpicked hand is drawn at random, an undeployed code is assigned, a turn left
// too long is a misfire, and a player who misfires three times in a row forfeits.
export function tick(g, now, rng = Math.random) {
  const ev = [];
  if (!g.timers || g.deadline == null || now < g.deadline) return ev;
  if (g.phase === "lobby") finish(g, null, "noshow", now, ev);
  else if (g.phase === "supply") {
    for (const s of [0, 1]) if (!g.p[s].pick) g.p[s].pick = RPS[Math.floor(rng() * 3)];
    resolveRps(g, now, ev);
  } else if (g.phase === "deploy") {
    for (const s of [0, 1]) {
      if (g.p[s].secret) continue;
      g.p[s].secret = randomCode(rng);
      ev.push([s, { t: "assigned", code: g.p[s].secret }]);
    }
    startBattle(g, now, ev);
  } else if (g.phase === "battle") {
    const s = g.turn;
    g.p[s].timeouts++;
    if (g.p[s].timeouts >= TIMES.maxTimeouts) finish(g, 1 - s, "timeout", now, ev);
    else volley(g, s, null, now, ev);
  }
  return ev;
}

export function view(g, s, now) {
  const me = g.p[s];
  const opp = g.p[1 - s];
  return {
    t: "state",
    code: g.code, phase: g.phase, now, deadline: g.deadline, match: g.match,
    me: {
      name: me.name, supplies: me.supplies, secret: me.secret, pick: me.pick, smoke: me.smoke,
      powerUsed: me.powerAt === g.volleys.length,
    },
    opp: opp ? { name: opp.name, supplies: opp.supplies, ready: !!opp.secret, picked: !!opp.pick, joined: opp.joined, smoke: opp.smoke } : null,
    turn: g.phase === "battle" ? (g.turn === s ? "me" : "opp") : null,
    first: g.first === s ? "me" : "opp",
    round: g.round,
    lastStand: g.lastStand,
    volleys: g.volleys.map((v) => volleyView(v, s)),
    powers: g.powers.filter((p) => p.by === s).map(({ kind, args, result, at }) => ({ kind, args, result, at })),
    oppPowers: g.powers.filter((p) => p.by !== s).map(({ kind, at }) => ({ kind, at })),
    result: g.result ? resultView(g, s) : null,
    rematch: { me: g.rematch[s], opp: g.rematch[1 - s] },
  };
}
