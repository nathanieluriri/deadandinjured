import { newGame, join, act, view } from "../shared/game.js";
import { Commander, LEVELS } from "./ai.js";
import { randomCode, RPS } from "../shared/rules.js";

const wsUrl = (path) => `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${path}`;

// A live match: one socket to the room's Durable Object, reopened after drops.
export class RemoteMatch {
  constructor(code, onMessage, onStatus) {
    this.code = code;
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.tries = 0;
    this.everOpen = false;
    this.closed = false;
    this.connect();
  }

  connect() {
    const ws = new WebSocket(wsUrl(`/ws/room/${this.code}`));
    this.ws = ws;
    ws.onopen = () => {
      this.tries = 0;
      this.everOpen = true;
      this.onStatus("online");
      clearInterval(this.ping);
      this.ping = setInterval(() => this.raw({ t: "ping" }), 20000);
    };
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.t !== "pong") this.onMessage(m);
    };
    ws.onclose = (e) => {
      clearInterval(this.ping);
      if (this.closed || ws !== this.ws) return;
      if (e.code === 4001) return this.onStatus("replaced");
      if (e.code === 4004) return this.onStatus("gone");
      this.tries++;
      if (!this.everOpen && this.tries >= 3) return this.onStatus("refused");
      this.onStatus("reconnecting");
      clearTimeout(this.retry);
      this.retry = setTimeout(() => this.connect(), Math.min(8000, 600 * 2 ** this.tries));
    };
  }

  raw(msg) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  send(msg) {
    this.raw(msg);
  }

  close() {
    this.closed = true;
    clearInterval(this.ping);
    clearTimeout(this.retry);
    try { this.ws.close(1000); } catch {}
  }
}

export function quickMatch({ onQueue, onMatched, onFail }) {
  const ws = new WebSocket(wsUrl("/ws/lobby"));
  let done = false;
  const ping = setInterval(() => ws.readyState === 1 && ws.send('{"t":"ping"}'), 20000);
  ws.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    if (m.t === "queue") onQueue(m.n);
    if (m.t === "matched") {
      done = true;
      onMatched(m.code);
    }
  };
  ws.onclose = () => {
    clearInterval(ping);
    if (!done) onFail();
  };
  return {
    cancel() {
      done = true;
      clearInterval(ping);
      try { ws.close(1000); } catch {}
    },
  };
}

// A match against the computer: the same engine the rooms run, played out in the page.
export class LocalMatch {
  constructor(level, name, onMessage) {
    this.onMessage = onMessage;
    this.level = level;
    this.ai = new Commander(level);
    this.timers = new Set();
    const now = Date.now();
    this.g = newGame({ code: "SOLO", host: { id: "me", name }, guest: { id: "cpu", name: LEVELS[level].name }, now, timers: false });
    join(this.g, "me", name, now);
    const r = join(this.g, "cpu", LEVELS[level].name, now);
    this.turns = 0;
    queueMicrotask(() => {
      this.deliver(r.events);
      this.onMessage({ t: "presence", opp: true });
      this.think();
    });
  }

  later(ms, fn) {
    const id = setTimeout(() => {
      this.timers.delete(id);
      if (!this.closed) fn();
    }, ms);
    this.timers.add(id);
  }

  deliver(events) {
    for (const [seat, ev] of events) {
      if (seat === 0) this.onMessage(ev);
      else this.see(ev);
    }
    this.onMessage(view(this.g, 0, Date.now()));
  }

  see(ev) {
    if (ev.t === "volley" && ev.by === "me") this.ai.learn(ev);
    if (ev.t === "power" && ev.by === "me") this.ai.learnPower(ev);
  }

  cpu(msg) {
    const r = act(this.g, 1, msg, Date.now());
    if (!r.error) this.deliver(r.events);
    this.think();
  }

  send(msg) {
    if (this.closed) return;
    if (msg.t === "aim") return;
    if (msg.t === "taunt") {
      if (Math.random() < 0.5) this.later(1400, () => this.onMessage({ t: "taunt", id: [0, 2, 4, 5][Math.floor(Math.random() * 4)] }));
      return;
    }
    const r = act(this.g, 0, msg, Date.now());
    if (r.error) this.onMessage({ t: "error", msg: r.error, re: msg.t });
    else this.deliver(r.events);
    this.think(msg.t);
  }

  think(after) {
    const g = this.g;
    const cpu = g.p[1];
    if (g.phase === "supply" && !cpu.pick) {
      this.later(900, () => g.phase === "supply" && !cpu.pick && this.cpu({ t: "pick", pick: RPS[Math.floor(Math.random() * 3)] }));
    } else if (g.phase === "deploy" && !cpu.secret) {
      this.later(g.p[0].secret ? 1200 : 5200, () => g.phase === "deploy" && !cpu.secret && this.cpu({ t: "deploy", code: randomCode() }));
    } else if (g.phase === "battle" && g.turn === 1 && !this.aiming) {
      this.aiming = true;
      const grace = g.volleys.length ? 5600 : 2600;
      const thinking = { recruit: 900, sergeant: 1500, general: 2200 }[this.level];
      this.later(grace + thinking * (0.6 + Math.random() * 0.8), () => this.fire());
    }
    if (after === "rematch" && g.phase === "over") this.later(700, () => this.cpu({ t: "rematch" }));
  }

  fire() {
    const g = this.g;
    if (g.phase !== "battle" || g.turn !== 1) {
      this.aiming = false;
      return;
    }
    const threat = Math.max(0, ...g.volleys.filter((v) => v.by === 0 && !v.miss).map((v) => v.dead));
    const cpu = g.p[1];
    const power = cpu.powerAt === g.volleys.length ? null : this.ai.choosePower(cpu.supplies, threat, this.turns);
    this.turns++;
    const shoot = () => {
      this.aiming = false;
      if (g.phase === "battle" && g.turn === 1) this.cpu({ t: "fire", guess: this.ai.guess() });
    };
    if (power) {
      const r = act(g, 1, { t: "power", ...power }, Date.now());
      if (!r.error) this.deliver(r.events);
      this.later(2200, shoot);
    } else shoot();
  }

  close() {
    this.closed = true;
    for (const id of this.timers) clearTimeout(id);
  }
}
