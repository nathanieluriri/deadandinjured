import { test } from "node:test";
import assert from "node:assert/strict";
import { isCode, score, rps, randomCode, allCodes, roomCode, ROOM_RE, cleanOrders, packOrders, parseOrders, randomOrders, STANDARD_ORDERS } from "../src/shared/rules.js";
import { newGame, newDrill, drillSmoke, join, act, tick, view, TIMES, turnMs, nextWake, shiftClocks, closest } from "../src/shared/game.js";
import { Commander } from "../src/client/ai.js";

const seeded = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

test("codes are four different digits", () => {
  assert.ok(isCode("0123"));
  assert.ok(isCode("9876"));
  assert.ok(!isCode("1123"));
  assert.ok(!isCode("123"));
  assert.ok(!isCode("12a4"));
  assert.ok(!isCode(1234));
  assert.equal(allCodes().length, 5040);
  for (let i = 0; i < 200; i++) assert.ok(isCode(randomCode()));
});

test("dead and injured", () => {
  assert.deepEqual(score("1024", "4071"), { dead: 1, injured: 2 });
  assert.deepEqual(score("4071", "4071"), { dead: 4, injured: 0 });
  assert.deepEqual(score("5689", "4071"), { dead: 0, injured: 0 });
  assert.deepEqual(score("1704", "4071"), { dead: 0, injured: 4 });
});

test("rock paper scissors", () => {
  assert.equal(rps("rock", "scissors"), 1);
  assert.equal(rps("scissors", "paper"), 1);
  assert.equal(rps("paper", "rock"), 1);
  assert.equal(rps("rock", "paper"), -1);
  assert.equal(rps("paper", "paper"), 0);
});

test("room codes", () => {
  for (let i = 0; i < 100; i++) assert.match(roomCode(), ROOM_RE);
});

const A = { id: "a", name: "Alpha" };
const B = { id: "b", name: "Bravo" };

function ready(now = 0) {
  const g = newGame({ code: "ABCDE", host: A, now });
  join(g, "a", "Alpha", now);
  join(g, "b", "Bravo", now);
  assert.equal(g.phase, "supply");
  act(g, 0, { t: "pick", pick: "rock" }, now);
  const r = act(g, 1, { t: "pick", pick: "scissors" }, now);
  const rpsEv = r.events.find(([s, e]) => s === 0 && e.t === "rps")[1];
  assert.equal(rpsEv.result, "win");
  assert.equal(g.phase, "deploy");
  assert.equal(g.p[0].supplies, 3);
  assert.equal(g.p[1].supplies, 2);
  assert.equal(g.first, 1, "the loser of the draw fires first");
  act(g, 0, { t: "deploy", code: "1234" }, now);
  act(g, 1, { t: "deploy", code: "5678" }, now);
  assert.equal(g.phase, "battle");
  assert.equal(g.turn, 1);
  return g;
}

test("a third player cannot join", () => {
  const g = newGame({ code: "ABCDE", host: A, now: 0 });
  join(g, "b", "Bravo", 0);
  assert.ok(join(g, "c", "Charlie", 0).error);
  assert.equal(join(g, "a", "Alpha", 0).seat, 0);
});

test("a drawn supply draw is thrown again", () => {
  const g = newGame({ code: "ABCDE", host: A, now: 0 });
  join(g, "a", "", 0);
  join(g, "b", "", 0);
  act(g, 0, { t: "pick", pick: "paper" }, 0);
  const r = act(g, 1, { t: "pick", pick: "paper" }, 0);
  assert.equal(r.events.find(([, e]) => e.t === "rps")[1].result, "draw");
  assert.equal(g.phase, "supply");
  assert.equal(g.p[0].pick, null);
});

test("secrets never reach the other side", () => {
  const g = ready();
  const v = view(g, 1, 0);
  assert.equal(v.me.secret, "5678");
  assert.ok(!JSON.stringify(v).includes("1234"));
  const r = act(g, 1, { t: "fire", guess: "1243" }, 0);
  for (const [s, e] of r.events) if (s === 1) assert.ok(!JSON.stringify(e).includes("1234"));
  assert.deepEqual(r.events.find(([s]) => s === 1)[1], { t: "volley", by: "me", guess: "1243", dead: 2, injured: 2, smoked: false, round: 1 });
});

test("only the shooter on turn can fire", () => {
  const g = ready();
  assert.ok(act(g, 0, { t: "fire", guess: "5678" }, 0).error);
  assert.ok(act(g, 1, { t: "fire", guess: "1123" }, 0).error);
  assert.ok(!act(g, 1, { t: "fire", guess: "9012" }, 0).error);
  assert.equal(g.turn, 0);
});

test("the second shooter gets a last stand", () => {
  const g = ready();
  act(g, 1, { t: "fire", guess: "1234" }, 0);
  assert.equal(g.phase, "battle");
  assert.equal(g.lastStand, true);
  assert.equal(g.turn, 0);
  const r = act(g, 0, { t: "fire", guess: "5687" }, 0);
  assert.equal(g.phase, "over");
  assert.equal(g.result.winner, 1);
  assert.equal(r.events.find(([s, e]) => s === 0 && e.t === "over")[1].winner, "opp");
});

test("a last stand that lands is a draw", () => {
  const g = ready();
  act(g, 1, { t: "fire", guess: "1234" }, 0);
  act(g, 0, { t: "fire", guess: "5678" }, 0);
  assert.equal(g.result.winner, -1);
  assert.equal(view(g, 0, 0).result.winner, "draw");
});

test("the second shooter wins outright", () => {
  const g = ready();
  act(g, 1, { t: "fire", guess: "9012" }, 0);
  act(g, 0, { t: "fire", guess: "5678" }, 0);
  assert.equal(g.result.winner, 0);
  assert.equal(view(g, 0, 0).result.codes.opp, "5678");
});

test("supplies", () => {
  const g = ready();
  act(g, 1, { t: "fire", guess: "9012" }, 0);
  let r = act(g, 0, { t: "power", kind: "recon", digit: 7 }, 0);
  assert.deepEqual(r.events[0][1], { t: "power", by: "me", kind: "recon", args: { digit: "7" }, result: true });
  assert.deepEqual(r.events[1][1], { t: "power", by: "opp", kind: "recon" });
  assert.ok(act(g, 0, { t: "power", kind: "sniper", digit: 7, pos: 2 }, 0).error, "one per turn");
  act(g, 0, { t: "fire", guess: "9013" }, 0);
  r = act(g, 1, { t: "power", kind: "smoke" }, 0);
  assert.equal(g.p[1].smoke, true);
  act(g, 1, { t: "fire", guess: "9014" }, 0);
  r = act(g, 0, { t: "fire", guess: "5687" }, 0);
  assert.deepEqual(r.events.find(([s]) => s === 0)[1], { t: "volley", by: "me", guess: "5687", hits: 4, smoked: true, round: 2 });
  assert.equal(r.events.find(([s]) => s === 1)[1].dead, 2);
  assert.equal(g.p[1].smoke, false);
  r = act(g, 1, { t: "power", kind: "sniper", digit: "1", pos: 0 }, 0);
  assert.equal(r.events[0][1].result, true);
  assert.equal(g.p[0].supplies, 2);
  assert.equal(g.p[1].supplies, 0);
  assert.ok(act(g, 1, { t: "power", kind: "recon", digit: 1 }, 0).error);
});

test("deadlines: auto picks, assigned codes, misfires and forfeits", () => {
  const g = newGame({ code: "ABCDE", host: A, now: 0 });
  join(g, "a", "", 0);
  join(g, "b", "", 0);
  let t = 0;
  t += TIMES.supply + 2000;
  let ev = tick(g, t, seeded(3));
  assert.ok(ev.some(([, e]) => e.t === "rps"));
  while (g.phase === "supply") { t += TIMES.supply + TIMES.graceRps; tick(g, t, seeded(t)); }
  assert.equal(g.phase, "deploy");
  act(g, 0, { t: "deploy", code: "4071" }, t);
  t += TIMES.deploy + TIMES.graceRps;
  ev = tick(g, t, seeded(9));
  assert.ok(ev.some(([s, e]) => s === 1 && e.t === "assigned" && isCode(e.code)));
  assert.equal(g.phase, "battle");
  const first = g.turn;
  for (let i = 0; i < 5 && g.phase === "battle"; i++) {
    t += turnMs(g) + TIMES.graceVolley;
    if (g.turn !== first) act(g, g.turn, { t: "fire", guess: "9876" === g.p[first].secret ? "6789" : "9876" }, t);
    else tick(g, t);
  }
  assert.equal(g.phase, "over");
  assert.equal(g.result.reason, "timeout");
  assert.equal(g.result.winner, 1 - first);
});

test("a matched player who never shows up cancels the room", () => {
  const g = newGame({ code: "ABCDE", host: A, guest: B, now: 0 });
  join(g, "a", "", 0);
  tick(g, TIMES.lobby + 1);
  assert.equal(g.phase, "over");
  assert.equal(view(g, 0, 0).result.winner, "none");
});

test("rematch resets everything", () => {
  const g = ready();
  act(g, 1, { t: "fire", guess: "9012" }, 0);
  act(g, 0, { t: "fire", guess: "5678" }, 0);
  act(g, 0, { t: "rematch" }, 0);
  assert.equal(g.phase, "over");
  const r = act(g, 1, { t: "rematch" }, 0);
  assert.ok(r.events.some(([, e]) => e.t === "restart"));
  assert.equal(g.phase, "supply");
  assert.equal(g.volleys.length, 0);
  assert.equal(g.p[0].secret, null);
  assert.equal(g.match, 2);
});

test("leaving hands the win to the other side", () => {
  const g = ready();
  act(g, 0, { t: "leave" }, 0);
  assert.equal(g.result.winner, 1);
  assert.equal(g.result.reason, "left");
});

function solve(level, seed) {
  const rng = seeded(seed);
  const secret = randomCode(rng);
  const ai = new Commander(level, rng);
  for (let n = 1; n <= 30; n++) {
    const guess = ai.guess();
    const r = score(guess, secret);
    if (r.dead === 4) return n;
    ai.learn({ guess, ...r });
  }
  return 99;
}

test("the computer cracks codes at every level", () => {
  const avg = {};
  for (const level of ["recruit", "sergeant", "general"]) {
    let total = 0;
    const runs = level === "general" ? 12 : 40;
    for (let i = 0; i < runs; i++) {
      const n = solve(level, 1000 + i);
      assert.ok(n < 30, `${level} never cracked it`);
      total += n;
    }
    avg[level] = total / runs;
  }
  assert.ok(avg.general <= avg.sergeant + 0.4, JSON.stringify(avg));
  assert.ok(avg.sergeant < avg.recruit, JSON.stringify(avg));
  assert.ok(avg.general < 6.2, JSON.stringify(avg));
  console.log("average volleys to crack", avg);
});

test("supplies narrow the computer's options", () => {
  const ai = new Commander("general", seeded(5));
  const secret = "4071";
  const p = ai.choosePower(3, 0, 2);
  assert.equal(p.kind, "recon");
  ai.learnPower({ kind: "recon", args: { digit: p.digit }, result: secret.includes(p.digit) });
  assert.ok(ai.cands.every((c) => c.includes(p.digit) === secret.includes(p.digit)));
  assert.equal(ai.choosePower(3, 3, 4).kind, "smoke");
  assert.equal(ai.choosePower(0, 3, 4), null);
});

// ---- orders: supplies, crates, the clock and quick match ------------------------------------

// Seat 0 wins the draw with rock over scissors unless told otherwise.
function drawn({ orders, offers, now = 0, win = 0, timers = true } = {}) {
  const g = newGame({ code: "ABCDE", host: A, guest: offers ? B : null, now, orders, offers, timers });
  join(g, "a", "Alpha", now);
  join(g, "b", "Bravo", now);
  act(g, 0, { t: "pick", pick: win === 0 ? "rock" : "scissors" }, now);
  const r = act(g, 1, { t: "pick", pick: win === 0 ? "scissors" : "rock" }, now);
  return { g, r };
}

function battle(opts = {}, now = 0) {
  const { g, r } = drawn({ ...opts, now });
  act(g, 0, { t: "deploy", code: "1234" }, now);
  act(g, 1, { t: "deploy", code: "5678" }, now);
  assert.equal(g.phase, "battle");
  return { g, r };
}

test("orders are validated and packed", () => {
  assert.deepEqual(cleanOrders(null), STANDARD_ORDERS);
  assert.deepEqual(cleanOrders({ crates: 9, minutes: 7, recon: "yes", sniper: false }), { recon: true, sniper: false, smoke: true, crates: 5, minutes: 10 });
  assert.equal(cleanOrders({ crates: 0 }).crates, 1);
  assert.equal(cleanOrders({ crates: "2" }).crates, 2);
  assert.equal(cleanOrders({ minutes: 5 }).minutes, 5);
  assert.equal(packOrders({ recon: false, sniper: true, smoke: false, crates: 4, minutes: 5 }), "010405");
  assert.deepEqual(parseOrders("010405"), { recon: false, sniper: true, smoke: false, crates: 4, minutes: 5 });
  assert.equal(parseOrders("11161O"), null);
  assert.deepEqual(cleanOrders("101215"), { recon: true, sniper: false, smoke: true, crates: 2, minutes: 15 });
  for (let i = 0; i < 50; i++) {
    const r = randomOrders(seeded(i + 1));
    assert.deepEqual(cleanOrders(r), r, "random orders are always valid");
  }
});

test("every crate count: the winner takes them all, the loser one fewer and the first shot", () => {
  for (let crates = 1; crates <= 5; crates++) {
    for (const win of [0, 1]) {
      const { g, r } = drawn({ orders: { crates }, win });
      assert.equal(g.p[win].supplies, crates);
      assert.equal(g.p[1 - win].supplies, crates - 1);
      assert.equal(g.first, 1 - win);
      const ev = r.events.find(([s, e]) => s === win && e.t === "rps")[1];
      assert.deepEqual(ev.supplies, { me: crates, opp: crates - 1 });
      assert.equal(ev.first, "opp");
      assert.equal(ev.orders.crates, crates);
    }
  }
});

test("a supply switched off cannot be used", () => {
  for (const off of ["recon", "sniper", "smoke"]) {
    const { g } = battle({ orders: { [off]: false } });
    const msg = { recon: { t: "power", kind: "recon", digit: 1 }, sniper: { t: "power", kind: "sniper", digit: 1, pos: 0 }, smoke: { t: "power", kind: "smoke" } };
    const r = act(g, g.turn, msg[off], 0);
    assert.match(r.error, /is off in this match/);
    const on = ["recon", "sniper", "smoke"].find((k) => k !== off);
    assert.ok(!act(g, g.turn, msg[on], 0).error, `${on} still works`);
    assert.equal(view(g, 0, 0).orders[off], false);
  }
});

test("all supplies off: no crates, and the winner of the draw fires first", () => {
  const { g, r } = drawn({ orders: { recon: false, sniper: false, smoke: false, crates: 5 }, win: 1 });
  assert.equal(g.p[0].supplies, 0);
  assert.equal(g.p[1].supplies, 0);
  assert.equal(g.first, 1);
  assert.equal(r.events.find(([s, e]) => s === 1 && e.t === "rps")[1].first, "me");
  act(g, 0, { t: "deploy", code: "1234" }, 0);
  act(g, 1, { t: "deploy", code: "5678" }, 0);
  assert.match(act(g, 1, { t: "power", kind: "smoke" }, 0).error, /off/);
});

test("turn length follows the time limit", () => {
  for (const [minutes, sec] of [[5, 30], [10, 45], [15, 60]]) {
    const { g } = battle({ orders: { minutes } }, 1000);
    assert.equal(turnMs(g), sec * 1000);
    assert.equal(g.deadline, 1000 + TIMES.graceBattle + sec * 1000);
    assert.equal(g.clockEnd, 1000 + TIMES.graceBattle + minutes * 60e3);
    assert.equal(view(g, 0, 1000).turnMs, sec * 1000);
    assert.equal(view(g, 0, 1000).clock, g.clockEnd);
  }
});

test("the room wakes for whichever comes first, the turn or the clock", () => {
  const { g } = battle({ orders: { minutes: 5 } });
  assert.equal(nextWake(g), g.deadline);
  g.deadline = g.clockEnd + 5000;
  assert.equal(nextWake(g), g.clockEnd);
  g.timers = false;
  assert.equal(nextWake(g), g.clockEnd);
  g.timeUp = true;
  assert.equal(nextWake(g), null);
});

test("time up at the start of a round ends the match at once", () => {
  const { g } = battle({ orders: { minutes: 5 } });
  const first = g.first;
  act(g, first, { t: "fire", guess: first === 0 ? "5690" : "1290" }, 1000);
  act(g, 1 - first, { t: "fire", guess: first === 0 ? "1790" : "5790" }, 2000);
  assert.equal(g.turn, first);
  const ev = tick(g, g.clockEnd);
  assert.equal(g.phase, "over");
  assert.equal(g.result.reason, "time");
  assert.ok(ev.some(([, e]) => e.t === "over" && e.reason === "time"));
});

test("time up mid-round: the second shooter still gets their shot", () => {
  const { g } = battle({ orders: { minutes: 5 } });
  const first = g.first;
  const second = 1 - first;
  // first shooter hits 2 dead just before the clock runs out, before the reply
  act(g, first, { t: "fire", guess: first === 0 ? "5690" : "1290" }, g.clockEnd - 2000);
  const ev = tick(g, g.clockEnd + 1);
  assert.equal(g.phase, "battle");
  assert.equal(g.turn, second);
  assert.deepEqual(ev.find(([s]) => s === second)[1], { t: "timeup", by: "me" });
  assert.ok(act(g, first, { t: "fire", guess: "9012" }, g.clockEnd + 2).error, "no extra round");
  act(g, second, { t: "fire", guess: second === 0 ? "5678".slice(0, 3) + "9" : "1239" }, g.clockEnd + 3);
  assert.equal(g.phase, "over");
  assert.equal(g.result.reason, "time");
  assert.equal(g.result.winner, second, "3 dead beats 2 dead");
  const v = view(g, second, 0).result;
  assert.deepEqual(v.best.me, { dead: 3, injured: 0, shot: 1 });
  assert.deepEqual(v.best.opp, { dead: 2, injured: 0, shot: 1 });
});

test("time up mid-round: a misfire still closes the round", () => {
  const { g } = battle({ orders: { minutes: 5 } });
  const first = g.first;
  act(g, first, { t: "fire", guess: first === 0 ? "5690" : "1290" }, 1000);
  tick(g, g.clockEnd + 1);
  tick(g, g.deadline + 1);
  assert.equal(g.phase, "over");
  assert.equal(g.result.reason, "time");
  assert.equal(g.result.winner, first);
});

test("time up during a last stand: the last stand is played out", () => {
  const { g } = battle({ orders: { minutes: 5 } });
  const first = g.first;
  const code = (s) => (s === 0 ? "1234" : "5678");
  act(g, first, { t: "fire", guess: code(1 - first) }, g.clockEnd - 2000);
  assert.equal(g.lastStand, true);
  tick(g, g.clockEnd + 1);
  assert.equal(g.phase, "battle", "the last stand goes on");
  act(g, 1 - first, { t: "fire", guess: code(first) }, g.clockEnd + 2);
  assert.equal(g.result.reason, "cracked");
  assert.equal(g.result.winner, -1);
});

test("the tiebreak: dead, then injured, then fewer shots, then a stalemate", () => {
  const mk = (vs) => ({ volleys: vs.map(([by, dead, injured, miss]) => (miss ? { by, miss: true } : { by, dead, injured })) });
  assert.equal(closest(mk([[0, 1, 3], [1, 2, 0]])).winner, 1, "more dead wins");
  assert.equal(closest(mk([[0, 1, 2], [1, 1, 1]])).winner, 0, "then more injured");
  assert.equal(closest(mk([[0, 0, 0], [1, 0, 0], [0, 2, 1], [1, 0, 1], [1, 2, 1]])).winner, 0, "then fewer shots");
  const t = closest(mk([[0, 0, 0], [1, 0, 0], [0, 0, 0, true], [1, 2, 1], [0, 2, 1]]));
  assert.equal(t.winner, 1, "a misfire still counts as a shot");
  assert.deepEqual(t.best, [{ dead: 2, injured: 1, shot: 3 }, { dead: 2, injured: 1, shot: 2 }]);
  assert.equal(closest(mk([[0, 1, 1], [1, 1, 1]])).winner, -1, "a dead heat on the same shot");
  assert.equal(closest(mk([[0, 0, 0], [1, 0, 0, true]])).winner, -1, "nothing hit on either side");
  assert.equal(closest(mk([])).winner, -1);
});

test("the tiebreak sees through smoke", () => {
  const { g } = battle({ orders: { minutes: 5 } });
  const first = g.first;
  const second = 1 - first;
  act(g, first, { t: "fire", guess: first === 0 ? "5690" : "1290" }, 1000);
  act(g, second, { t: "power", kind: "smoke" }, 1100);
  act(g, second, { t: "fire", guess: second === 0 ? "5609" : "1209" }, 1200);
  act(g, first, { t: "fire", guess: first === 0 ? "5678".slice(0, 3) + "9" : "1239" }, 1300);
  const seen = view(g, first, 0).volleys.at(-1);
  assert.equal(seen.hits, 3, "the shooter only sees hits");
  assert.equal(seen.dead, undefined);
  tick(g, g.clockEnd + 1);
  act(g, second, { t: "fire", guess: "9870" === (first === 0 ? "1234" : "5678") ? "9871" : "9870" }, g.clockEnd + 2);
  assert.equal(g.result.reason, "time");
  assert.equal(g.result.winner, first);
  assert.deepEqual(view(g, first, 0).result.best.me, { dead: 3, injured: 0, shot: 2 });
});

test("a win on time allows a rematch", () => {
  const { g } = battle({ orders: { minutes: 5 } });
  tick(g, g.clockEnd);
  assert.equal(g.result.reason, "time");
  act(g, 0, { t: "rematch" }, 0);
  act(g, 1, { t: "rematch" }, 0);
  assert.equal(g.phase, "supply");
  assert.equal(g.clockEnd, null);
  assert.equal(g.orders.minutes, 5, "a friend room keeps the host's orders");
});

test("quick match: each side brings orders, the draw decides whose stand", () => {
  const mine = { recon: true, sniper: false, smoke: false, crates: 5, minutes: 5 };
  const theirs = { recon: false, sniper: false, smoke: true, crates: 2, minutes: 15 };
  for (const win of [0, 1]) {
    const { g, r } = drawn({ offers: [mine, theirs], win });
    const stood = win === 0 ? mine : theirs;
    assert.deepEqual(g.orders, stood);
    assert.equal(g.p[win].supplies, stood.crates);
    assert.equal(g.p[1 - win].supplies, stood.crates - 1);
    const ev = r.events.find(([s, e]) => s === win && e.t === "rps")[1];
    assert.equal(ev.stand, "me");
    assert.equal(r.events.find(([s, e]) => s !== win && e.t === "rps")[1].stand, "opp");
    assert.deepEqual(view(g, 0, 0).offers, { me: mine, opp: theirs });
    assert.equal(view(g, win, 0).stand, "me");
    act(g, 0, { t: "deploy", code: "1234" }, 0);
    act(g, 1, { t: "deploy", code: "5678" }, 0);
    assert.equal(turnMs(g), stood.minutes === 5 ? 30e3 : 60e3);
  }
});

test("quick match: before the draw no orders stand", () => {
  const g = newGame({ code: "ABCDE", host: A, guest: B, now: 0, offers: [STANDARD_ORDERS, { crates: 1 }] });
  join(g, "a", "", 0);
  join(g, "b", "", 0);
  const v = view(g, 1, 0);
  assert.equal(v.orders, null);
  assert.equal(v.stand, null);
  assert.equal(v.offers.me.crates, 1);
});

test("quick match rematch: a new draw decides again, with orders changed on the end screen", () => {
  const mine = { ...STANDARD_ORDERS, crates: 5 };
  const theirs = { ...STANDARD_ORDERS, crates: 1 };
  const { g } = battle({ offers: [mine, theirs], win: 0 });
  assert.equal(g.orders.crates, 5);
  act(g, 0, { t: "leave" }, 0);
  act(g, 0, { t: "rematch", orders: { ...mine, minutes: 15 } }, 0);
  act(g, 1, { t: "rematch", orders: { ...theirs, crates: 4 } }, 0);
  assert.equal(g.phase, "supply");
  assert.equal(g.orders, null);
  assert.equal(g.offers[0].minutes, 15);
  assert.equal(g.offers[1].crates, 4);
  act(g, 0, { t: "pick", pick: "scissors" }, 0);
  act(g, 1, { t: "pick", pick: "rock" }, 0);
  assert.equal(g.orders.crates, 4, "this time the other side's orders stand");
  assert.equal(g.p[1].supplies, 4);
});

test("against the computer the clock runs without turn timers, and stops while paused", () => {
  const { g } = battle({ orders: { minutes: 5 }, timers: false });
  assert.equal(g.deadline, null);
  assert.ok(g.clockEnd > 0);
  const end = g.clockEnd;
  assert.deepEqual(tick(g, end - 1), []);
  shiftClocks(g, 60e3);
  assert.equal(g.clockEnd, end + 60e3);
  tick(g, end + 1);
  assert.equal(g.phase, "battle", "a paused minute is given back");
  tick(g, end + 60e3);
  assert.equal(g.phase, "over");
  assert.equal(g.result.reason, "time");
  assert.equal(g.result.winner, -1, "nothing fired: a solo draw");
});

test("rooms saved before orders existed play by the standard orders", () => {
  const { g } = battle();
  delete g.orders;
  delete g.offers;
  delete g.clockEnd;
  assert.equal(turnMs(g), 45e3);
  assert.equal(tick(g, 10).length, 0);
  assert.ok(!act(g, g.turn, { t: "power", kind: "recon", digit: 1 }, 0).error);
});

test("the computer only uses supplies that are on", () => {
  const off = { recon: false, sniper: false, smoke: true };
  const ai = new Commander("general", seeded(5));
  for (let turn = 0; turn < 6; turn++) {
    const p = ai.choosePower(3, turn % 4, turn, off);
    assert.ok(!p || p.kind === "smoke", JSON.stringify(p));
  }
  assert.equal(ai.choosePower(3, 3, 4, { recon: true, sniper: true, smoke: false })?.kind === "smoke", false);
  assert.equal(ai.choosePower(3, 0, 2, { recon: false, sniper: false, smoke: false }), null);
});

test("a drill: the enemy never fires, every turn is yours, a crate for each supply in one turn", () => {
  const g = newDrill({ name: "Alpha", now: 0, secret: "5019", mine: "5689" });
  let s = view(g, 0, 0);
  assert.equal(s.phase, "battle");
  assert.equal(s.turn, "me");
  assert.equal(s.me.supplies, 3);
  assert.equal(s.clock, null);
  assert.equal(nextWake(g), null);
  let r = act(g, 0, { t: "fire", guess: "1234" }, 1);
  assert.deepEqual(r.events.find(([seat]) => seat === 0)[1], { t: "volley", by: "me", guess: "1234", dead: 0, injured: 1, smoked: false, round: 1 });
  assert.equal(view(g, 0, 1).turn, "me");
  assert.deepEqual(act(g, 1, { t: "fire", guess: "1234" }, 1), { error: "Not your turn", events: [] });
  assert.deepEqual(act(g, 0, { t: "fire", guess: "5678" }, 2).events[0][1], { t: "volley", by: "me", guess: "5678", dead: 1, injured: 0, smoked: false, round: 2 });
  assert.equal(act(g, 0, { t: "fire", guess: "6782" }, 3).events[0][1].dead, 0);
  r = act(g, 0, { t: "power", kind: "recon", digit: "9" }, 4);
  assert.equal(r.events[0][1].result, true);
  // The drill squad's one move: smoke, so the next volley reports only its hits.
  assert.deepEqual(drillSmoke(g), [[0, { t: "power", by: "opp", kind: "smoke" }]]);
  assert.deepEqual(drillSmoke(g), []);
  assert.equal(view(g, 0, 4).opp.smoke, true);
  assert.equal(act(g, 0, { t: "power", kind: "smoke" }, 5).error, undefined);
  assert.deepEqual(act(g, 0, { t: "fire", guess: "5901" }, 6).events[0][1], { t: "volley", by: "me", guess: "5901", hits: 4, smoked: true, round: 4 });
  assert.equal(act(g, 0, { t: "power", kind: "sniper", digit: "0", pos: 1 }, 7).events[0][1].result, true);
  assert.equal(view(g, 0, 7).me.supplies, 0);
  assert.equal(act(g, 0, { t: "power", kind: "recon", digit: "1" }, 7).error, "No crates left");
  assert.deepEqual(act(g, 0, { t: "fire", guess: "5091" }, 8).events[0][1], { t: "volley", by: "me", guess: "5091", dead: 2, injured: 2, smoked: false, round: 5 });
  assert.deepEqual(tick(g, 1e9), []);
  r = act(g, 0, { t: "fire", guess: "5019" }, 9);
  const over = r.events.find(([seat, e]) => seat === 0 && e.t === "over")[1];
  assert.equal(over.winner, "me");
  assert.equal(over.reason, "cracked");
  assert.ok(!r.events.some(([, e]) => e.t === "laststand"));
  assert.equal(g.volleys.filter((v) => v.by === 1).length, 0);
  assert.equal(drillSmoke(g).length, 0);
});
