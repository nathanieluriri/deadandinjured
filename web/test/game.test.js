import { test } from "node:test";
import assert from "node:assert/strict";
import { isCode, score, rps, randomCode, allCodes, roomCode, ROOM_RE } from "../src/shared/rules.js";
import { newGame, join, act, tick, view, TIMES } from "../src/shared/game.js";
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
    t += TIMES.turn + TIMES.graceVolley;
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
