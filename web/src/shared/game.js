// The match engine. Pure functions over a plain JSON state, shared by the Room Durable Object
// (live matches) and the browser (matches against the computer). Every function that changes
// the state returns a list of [seat, event] pairs for the caller to deliver.
import { isCode, score, rps, randomCode, RPS, POWERS, POWER_NAMES, STANDARD_ORDERS, TURN_SECONDS, cleanOrders, anySupply } from "./rules.js";

export const TIMES = {
  lobby: 3 * 60e3,
  supply: 30e3,
  deploy: 75e3,
  graceRps: 4200,
  graceBattle: 2500,
  graceVolley: 5600,
  powerFloor: 20e3,
  maxTimeouts: 3,
  scale: 1,
};

// Before a quick match's draw nobody's orders apply yet; rooms saved before orders existed
// play by the standard ones.
export const rulesOf = (g) => g.orders || STANDARD_ORDERS;
export const turnMs = (g) => TURN_SECONDS[rulesOf(g).minutes] * 1000 * TIMES.scale;
export const clockMs = (g) => rulesOf(g).minutes * 60e3 * TIMES.scale;

const seatOf = (u) => ({
  id: u.id, name: u.name, joined: false, pick: null, secret: null,
  supplies: 0, powerAt: -1, smoke: false, timeouts: 0,
});

// `orders` are the rules of a friend room or a match against the computer (the host's); a quick
// match brings `offers`, one set per seat, and the supply draw decides whose stand.
export function newGame({ code, host, guest = null, now, timers = true, orders = null, offers = null }) {
  return {
    code, created: now, timers,
    orders: offers ? null : cleanOrders(orders),
    offers: offers ? [cleanOrders(offers[0]), cleanOrders(offers[1])] : null,
    stand: null, clockEnd: null, timeUp: false,
    p: [seatOf(host), guest ? seatOf(guest) : null],
    phase: "lobby",
    rpsRound: 0,
    first: 0, turn: 0, round: 1, lastStand: false,
    volleys: [], powers: [],
    deadline: timers ? now + TIMES.lobby : null,
    result: null, rematch: [false, false], match: 1, started: null, recorded: false,
  };
}

// Training: the enemy squad hides a code and never fires back. You hold every turn, with a crate
// for each supply that can go out in the same turn, and no clock runs.
export const DRILL_NAME = "Drill squad";
export function newDrill({ name, now, secret = randomCode(), mine = randomCode() }) {
  const g = newGame({ code: "DRILL", host: { id: "me", name }, guest: { id: "drill", name: DRILL_NAME }, now, timers: false });
  g.drill = true;
  for (const p of g.p) p.joined = true;
  g.p[0].secret = mine;
  g.p[1].secret = secret;
  g.p[0].supplies = POWERS.length;
  g.phase = "battle";
  g.started = now;
  return g;
}

// The drill squad pops smoke: their one move, so the next volley reports only its hits.
export function drillSmoke(g) {
  if (!g.drill || g.phase !== "battle" || g.p[1].smoke) return [];
  g.p[1].smoke = true;
  g.powers.push({ by: 1, kind: "smoke", args: null, result: true, at: g.volleys.length });
  return [[0, { t: "power", by: "opp", kind: "smoke" }]];
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
  if (g.offers) {
    g.orders = { ...g.offers[w] };
    g.stand = w;
  }
  // The winner takes the crates in the orders, the loser one fewer and the first shot. With every
  // supply off there are no crates, and the first shot is the prize.
  const o = rulesOf(g);
  const armed = anySupply(o);
  g.p[w].supplies = armed ? o.crates : 0;
  g.p[1 - w].supplies = armed ? o.crates - 1 : 0;
  g.first = armed ? 1 - w : w;
  g.turn = g.first;
  for (const s of [0, 1]) {
    ev.push([s, {
      t: "rps", me: g.p[s].pick, opp: g.p[1 - s].pick, result: s === w ? "win" : "lose",
      supplies: { me: g.p[s].supplies, opp: g.p[1 - s].supplies }, first: g.first === s ? "me" : "opp",
      orders: { ...o }, stand: g.offers ? (w === s ? "me" : "opp") : null,
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
  g.clockEnd = now + TIMES.graceBattle + clockMs(g);
  g.timeUp = false;
  g.deadline = later(g, now, TIMES.graceBattle + turnMs(g));
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
  const r = {
    winner: w === -1 ? "draw" : w == null ? "none" : w === s ? "me" : "opp",
    reason: g.result.reason,
    codes: { me: g.p[s]?.secret || null, opp: g.p[1 - s]?.secret || null },
  };
  if (g.result.best) r.best = { me: g.result.best[s], opp: g.result.best[1 - s] };
  return r;
}

// Each side's best volley by its true score (smoke hides it from the shooter, not from the
// server) and the shot on which it was first reached.
export function bestVolleys(g) {
  return [0, 1].map((s) => {
    let best = { dead: 0, injured: 0, shot: 0 };
    let n = 0;
    for (const v of g.volleys) {
      if (v.by !== s) continue;
      n++;
      if (v.miss) continue;
      if (v.dead > best.dead || (v.dead === best.dead && v.injured > best.injured)) best = { dead: v.dead, injured: v.injured, shot: n };
    }
    return best;
  });
}

// Time is up: the side closest to cracking wins. More dead, then more injured, then whoever
// got there in fewer shots; nothing hit on either side, or a dead heat, is a stalemate.
export function closest(g) {
  const [a, b] = bestVolleys(g);
  let winner = -1;
  if (a.dead !== b.dead) winner = a.dead > b.dead ? 0 : 1;
  else if (a.injured !== b.injured) winner = a.injured > b.injured ? 0 : 1;
  else if (a.dead + a.injured > 0 && a.shot !== b.shot) winner = a.shot < b.shot ? 0 : 1;
  return { winner, best: [a, b] };
}

function finishTime(g, now, ev) {
  const { winner, best } = closest(g);
  finish(g, winner, "time", now, ev, { best });
}

function finish(g, winner, reason, now, ev, extra = null) {
  g.phase = "over";
  g.result = { winner, reason, at: now, ...extra };
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
  if (g.drill) {
    // Nobody fires at you in the drill, so your own smoke lifts after your next volley.
    g.p[s].smoke = false;
    if (cracked) return finish(g, s, "cracked", now, ev);
    g.round++;
    return;
  }
  if (cracked && s === g.first) {
    g.lastStand = true;
    g.turn = o;
    g.deadline = later(g, now, TIMES.graceVolley + turnMs(g));
    for (const x of [0, 1]) ev.push([x, { t: "laststand", by: x === s ? "me" : "opp" }]);
    return;
  }
  if (cracked) return finish(g, g.lastStand ? -1 : s, "cracked", now, ev);
  if (s !== g.first) {
    if (g.lastStand) return finish(g, g.first, "cracked", now, ev);
    // The second shot of a round closes it; if the clock ran out meanwhile, the match ends here.
    if (g.timeUp || (g.clockEnd != null && now >= g.clockEnd)) return finishTime(g, now, ev);
    g.round++;
  }
  g.turn = o;
  g.deadline = later(g, now, TIMES.graceVolley + turnMs(g));
}

function reset(g, now, ev) {
  for (const p of g.p) Object.assign(p, { pick: null, secret: null, supplies: 0, powerAt: -1, smoke: false, timeouts: 0 });
  Object.assign(g, {
    rpsRound: 0, first: 0, turn: 0, round: 1, lastStand: false, volleys: [], powers: [],
    result: null, rematch: [false, false], match: g.match + 1, started: null, recorded: false,
    clockEnd: null, timeUp: false,
  });
  // A quick match rematch goes back to the draw with each side's own orders.
  if (g.offers) {
    g.orders = null;
    g.stand = null;
  }
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
      if (!rulesOf(g)[msg.kind]) return err(`${POWER_NAMES[msg.kind]} is off in this match`);
      if (me.supplies < 1) return err("No crates left");
      if (!g.drill && me.powerAt === g.volleys.length) return err("One supply per turn");
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
      if (g.timers) g.deadline = Math.max(g.deadline, now + TIMES.powerFloor);
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
      if (!opp || !["cracked", "timeout", "left", "time"].includes(g.result.reason)) return err("No rematch for this one");
      if (g.offers && msg.orders) g.offers[s] = cleanOrders(msg.orders);
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
// too long is a misfire, and a player who misfires three times in a row forfeits. The match
// clock runs even without turn timers; when it runs out at the start of a round the match ends,
// otherwise the round (or a last stand) is played out first.
export function tick(g, now, rng = Math.random) {
  const ev = [];
  if (g.phase === "battle" && g.clockEnd != null && now >= g.clockEnd && !g.timeUp) {
    g.timeUp = true;
    if (g.turn === g.first && !g.lastStand) {
      finishTime(g, now, ev);
      return ev;
    }
    for (const s of [0, 1]) ev.push([s, { t: "timeup", by: g.turn === s ? "me" : "opp" }]);
  }
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

// Moves every running clock on by `ms`: a match against the computer stands still while paused.
export function shiftClocks(g, ms) {
  if (g.clockEnd != null) g.clockEnd += ms;
  if (g.deadline != null) g.deadline += ms;
}

// The earliest moment tick() has work to do, for the room's alarm.
export function nextWake(g) {
  const at = [g.timers ? g.deadline : null, g.phase === "battle" && !g.timeUp ? g.clockEnd : null].filter((x) => x != null);
  return at.length ? Math.min(...at) : null;
}

export function view(g, s, now) {
  const me = g.p[s];
  const opp = g.p[1 - s];
  return {
    t: "state",
    code: g.code, phase: g.phase, now, deadline: g.deadline, match: g.match,
    orders: g.orders ? { ...g.orders } : null,
    offers: g.offers ? { me: { ...g.offers[s] }, opp: { ...g.offers[1 - s] } } : null,
    stand: g.stand == null ? null : g.stand === s ? "me" : "opp",
    clock: g.clockEnd ?? null, timeUp: !!g.timeUp, turnMs: turnMs(g),
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
