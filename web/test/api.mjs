// The Worker, the rooms and the lobby over plain HTTP and sockets, no browser: a friend room's
// orders, quick match orders decided by the draw, and solo draws on the record.
//   npx wrangler dev   (in another shell)
//   node test/api.mjs [http://127.0.0.1:8787]
// With --clock it only checks that a room wakes itself when the match clock runs out; run that
// against a Worker started with --var TIME_SCALE:0.05, where five minutes last fifteen seconds.
const BASE = process.argv.slice(2).find((a) => a.startsWith("http")) || "http://127.0.0.1:8787";
const CLOCK = process.argv.includes("--clock");
const WS = BASE.replace(/^http/, "ws");
const tag = Date.now().toString(36).slice(-5);
const fail = (m) => {
  console.error("FAIL:", m);
  process.exit(1);
};
const check = (ok, m) => ok || fail(m);

async function enlist(name) {
  const r = await fetch(`${BASE}/api/enlist`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
  check(r.status === 201, `enlist ${name}: ${r.status}`);
  const cookie = r.headers.get("set-cookie").split(";")[0];
  const call = async (path, body) => {
    const res = await fetch(`${BASE}${path}`, body === undefined ? { headers: { Cookie: cookie } } : {
      method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return { status: res.status, data: await res.json() };
  };
  return { name, cookie, call };
}

// A socket that keeps every message and can wait for one that matches.
function socket(path, cookie) {
  const ws = new WebSocket(`${WS}${path}`, { headers: { Cookie: cookie } });
  const seen = [];
  const waiters = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    seen.push(m);
    for (const w of waiters.slice()) if (w.fn(m)) {
      waiters.splice(waiters.indexOf(w), 1);
      w.done(m);
    }
  };
  const open = new Promise((ok, no) => {
    ws.onopen = ok;
    ws.onerror = () => no(new Error(`socket ${path} failed`));
  });
  const until = (fn, ms = 15000) => {
    const hit = seen.find(fn);
    if (hit) return Promise.resolve(hit);
    return new Promise((done, no) => {
      waiters.push({ fn, done });
      setTimeout(() => no(new Error(`timed out on ${path}`)), ms);
    });
  };
  return { ws, open, until, send: (m) => ws.send(JSON.stringify(m)), seen };
}

if (CLOCK) {
  const host = await enlist(`Clock${tag}`);
  const guest = await enlist(`Tick${tag}`);
  const r = await host.call("/api/rooms", { orders: { minutes: 5 } });
  const a = socket(`/ws/room/${r.data.code}`, host.cookie);
  const b = socket(`/ws/room/${r.data.code}`, guest.cookie);
  await Promise.all([a.open, b.open]);
  await a.until((m) => m.t === "state" && m.phase === "supply");
  a.send({ t: "pick", pick: "rock" });
  b.send({ t: "pick", pick: "scissors" });
  await a.until((m) => m.t === "state" && m.phase === "deploy");
  a.send({ t: "deploy", code: "1234" });
  b.send({ t: "deploy", code: "5678" });
  await a.until((m) => m.t === "state" && m.phase === "battle");
  // Nobody fires: turns run out as misfires until the clock does, and the room ends it by itself.
  const over = await a.until((m) => m.t === "over", 60000);
  check(over.reason === "time" && over.winner === "draw", `time up with nothing hit is a stalemate ${JSON.stringify(over)}`);
  check(a.seen.filter((m) => m.t === "volley" && m.miss).length < 3, "ended by the clock, not by three misfires");
  console.log("the room woke at the clock's end:", over.reason, over.winner);
  console.log("PASS");
  process.exit(0);
}

// A friend room carries the host's orders, cleaned on the server, and shows them to a joiner.
{
  const host = await enlist(`Host${tag}`);
  const r = await host.call("/api/rooms", { orders: { recon: false, sniper: true, smoke: true, crates: 9, minutes: 5 } });
  check(r.status === 201, `open room: ${r.status}`);
  check(r.data.orders.crates === 5 && r.data.orders.recon === false && r.data.orders.minutes === 5, `room orders ${JSON.stringify(r.data.orders)}`);
  const peek = await host.call(`/api/rooms/${r.data.code}`);
  check(JSON.stringify(peek.data.room.orders) === JSON.stringify(r.data.orders), "the join screen sees the host's orders");
  console.log("friend room", r.data.code, "orders", JSON.stringify(peek.data.room.orders));

  const guest = await enlist(`Guest${tag}`);
  const a = socket(`/ws/room/${r.data.code}`, host.cookie);
  const b = socket(`/ws/room/${r.data.code}`, guest.cookie);
  await Promise.all([a.open, b.open]);
  const st = await b.until((m) => m.t === "state" && m.phase === "supply");
  check(st.orders.crates === 5 && st.offers === null && st.turnMs === 30000, `guest sees the host's orders in play ${JSON.stringify(st.orders)}`);
  a.send({ t: "pick", pick: "rock" });
  b.send({ t: "pick", pick: "scissors" });
  const rps = await a.until((m) => m.t === "rps");
  check(rps.supplies.me === 5 && rps.supplies.opp === 4 && rps.first === "opp", `crates split ${JSON.stringify(rps)}`);
  a.send({ t: "deploy", code: "1234" });
  b.send({ t: "deploy", code: "5678" });
  const battle = await b.until((m) => m.t === "state" && m.phase === "battle");
  check(battle.clock > battle.now + 4.5 * 60e3 && battle.clock <= battle.now + 5 * 60e3 + 5000, "a five minute clock");
  b.send({ t: "power", kind: "recon", digit: 1 });
  const off = await b.until((m) => m.t === "error");
  check(/Recon is off/.test(off.msg), `recon switched off: ${off.msg}`);
  a.ws.close();
  b.ws.close();
  console.log("friend room: crates 5 and 4, five minutes, recon refused");
}

// Quick match: both sides' orders ride in, the draw decides whose stand.
{
  const p = await enlist(`QA${tag}`);
  const q = await enlist(`QB${tag}`);
  const la = socket(`/ws/lobby?o=100105`, p.cookie);
  await la.open;
  la.send({ t: "orders", orders: { recon: true, sniper: false, smoke: false, crates: 2, minutes: 5 } });
  await new Promise((r) => setTimeout(r, 300));
  const lb = socket(`/ws/lobby?o=011415`, q.cookie);
  const [ma, mb] = await Promise.all([la.until((m) => m.t === "matched"), lb.until((m) => m.t === "matched")]);
  check(ma.code === mb.code, "both told the same room");
  const a = socket(`/ws/room/${ma.code}`, p.cookie);
  const b = socket(`/ws/room/${ma.code}`, q.cookie);
  await Promise.all([a.open, b.open]);
  const sa = await a.until((m) => m.t === "state" && m.phase === "supply");
  const mineA = { recon: true, sniper: false, smoke: false, crates: 2, minutes: 5 };
  const mineB = { recon: false, sniper: true, smoke: true, crates: 4, minutes: 15 };
  check(JSON.stringify(sa.offers) === JSON.stringify({ me: mineA, opp: mineB }), `offers ${JSON.stringify(sa.offers)}`);
  check(sa.orders === null, "no orders stand before the draw");
  a.send({ t: "pick", pick: "paper" });
  b.send({ t: "pick", pick: "scissors" });
  const rb = await b.until((m) => m.t === "rps");
  check(rb.result === "win" && rb.stand === "me" && JSON.stringify(rb.orders) === JSON.stringify(mineB), `B's orders stand ${JSON.stringify(rb)}`);
  check(rb.supplies.me === 4 && rb.supplies.opp === 3, "crates from the orders that stand");
  const after = await a.until((m) => m.t === "state" && m.phase === "deploy");
  check(after.stand === "opp" && after.turnMs === 60000, "the winner's turn length");
  for (const s of [a, b, la, lb]) s.ws.close();
  console.log("quick match: the draw winner's orders stand (4 crates, 15 minutes)");
}

// Solo results: a win, a loss and a draw each land in their own column.
{
  const p = await enlist(`Solo${tag}`);
  for (const result of ["win", "loss", "draw", "draw"]) check((await p.call("/api/solo", { result })).status === 200, `solo ${result}`);
  check((await p.call("/api/solo", { result: "maybe" })).status === 400, "unknown results are refused");
  const me = (await p.call("/api/me")).data.player;
  check(me.soloWins === 1 && me.soloLosses === 1 && me.soloDraws === 2, `solo record ${JSON.stringify(me)}`);
  console.log("solo record", me.soloWins, "won", me.soloLosses, "lost", me.soloDraws, "drawn");
}

console.log("PASS");
process.exit(0);
