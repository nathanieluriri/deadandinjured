import { DurableObject } from "cloudflare:workers";
import { newGame, join, act, tick, view } from "../shared/game.js";

const IDLE = 30 * 60e3;
const AFTER = 10 * 60e3;
const TAUNTS = 6;

// One match. Sockets use the hibernation API, so an idle room costs nothing between moves;
// the game state lives in the object's own storage and is reloaded when it wakes.
export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.g = undefined;
    this.rate = new Map();
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
  }

  async load() {
    if (this.g === undefined) this.g = (await this.ctx.storage.get("g")) ?? null;
    return this.g;
  }

  async save() {
    const g = this.g;
    await this.ctx.storage.put("g", g);
    const at = Math.min(g.deadline ?? Infinity, g.expires ?? Infinity);
    if (Number.isFinite(at)) await this.ctx.storage.setAlarm(at);
  }

  async init({ code, host, guest = null }) {
    await this.load();
    if (this.g) return { ok: false };
    const now = Date.now();
    this.g = newGame({ code, host, guest, now });
    this.g.expires = now + IDLE;
    await this.save();
    return { ok: true };
  }

  async peek() {
    await this.load();
    const g = this.g;
    if (!g) return null;
    return { phase: g.phase, host: g.p[0].name, open: g.phase === "lobby" && !g.p[1] };
  }

  sockets(seat, except) {
    return this.ctx.getWebSockets(`s${seat}`).filter((ws) => ws !== except && ws.readyState === WebSocket.OPEN);
  }

  send(seat, msg, except) {
    const data = JSON.stringify(msg);
    for (const ws of this.sockets(seat, except)) {
      try { ws.send(data); } catch {}
    }
  }

  deliver(events) {
    for (const [seat, ev] of events) if (this.g.p[seat]) this.send(seat, ev);
  }

  states() {
    const now = Date.now();
    for (const s of [0, 1]) if (this.g.p[s]) this.send(s, view(this.g, s, now));
  }

  presence(except) {
    for (const s of [0, 1]) this.send(s, { t: "presence", opp: this.sockets(1 - s, except).length > 0 }, except);
  }

  async commit(events) {
    const g = this.g;
    if (g.phase === "over" && !g.closing) {
      g.closing = true;
      g.expires = Date.now() + AFTER;
    } else if (g.phase !== "over") {
      g.closing = false;
      g.expires = Math.max(g.expires || 0, Date.now() + IDLE);
    }
    await this.save();
    this.deliver(events);
    this.states();
    if (g.phase === "over" && !g.recorded) await this.record();
  }

  async fetch(req) {
    await this.load();
    if (!this.g) return new Response("No such room", { status: 404 });
    if (req.headers.get("Upgrade") !== "websocket") return new Response("Expected a websocket", { status: 426 });
    const now = Date.now();
    const r = join(this.g, req.headers.get("x-pid"), req.headers.get("x-name"), now);
    if (r.error) return new Response(r.error, { status: 409 });
    const [client, server] = Object.values(new WebSocketPair());
    for (const old of this.ctx.getWebSockets(`s${r.seat}`)) {
      try { old.close(4001, "Opened in another tab"); } catch {}
    }
    this.ctx.acceptWebSocket(server, [`s${r.seat}`]);
    server.serializeAttachment({ seat: r.seat });
    await this.commit(r.events);
    this.presence();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    await this.load();
    if (!this.g) return ws.close(4004, "Room closed");
    const { seat } = ws.deserializeAttachment() || {};
    if (seat !== 0 && seat !== 1) return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== "object") return;
    const now = Date.now();
    if (msg.t === "sync") return ws.send(JSON.stringify(view(this.g, seat, now)));
    if (msg.t === "taunt" || msg.t === "aim") return this.relay(seat, msg, now);
    const events = tick(this.g, now);
    const r = act(this.g, seat, msg, now);
    if (r.error) ws.send(JSON.stringify({ t: "error", msg: r.error, re: msg.t }));
    if (r.error && !events.length) return;
    await this.commit([...events, ...r.events]);
  }

  relay(seat, msg, now) {
    const key = `${seat}${msg.t}`;
    if (now - (this.rate.get(key) || 0) < (msg.t === "taunt" ? 1200 : 150)) return;
    this.rate.set(key, now);
    const n = Math.max(0, Math.min(msg.t === "taunt" ? TAUNTS - 1 : 4, Math.floor(Number(msg.t === "taunt" ? msg.id : msg.n) || 0)));
    this.send(1 - seat, msg.t === "taunt" ? { t: "taunt", id: n } : { t: "aim", n });
  }

  async webSocketClose(ws, code) {
    try { ws.close(code === 1005 ? 1000 : code, "bye"); } catch {}
    await this.load();
    if (this.g) this.presence(ws);
  }

  async webSocketError(ws) {
    await this.load();
    if (this.g) this.presence(ws);
  }

  async alarm() {
    await this.load();
    const g = this.g;
    if (!g) return;
    const now = Date.now();
    if (g.expires && now >= g.expires) {
      for (const ws of this.ctx.getWebSockets()) {
        try { ws.close(4004, "Room closed"); } catch {}
      }
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
      this.g = null;
      return;
    }
    await this.commit(tick(g, now));
  }

  async record() {
    const g = this.g;
    g.recorded = true;
    await this.ctx.storage.put("g", g);
    const res = g.result;
    if (!this.env.DB || !res || res.winner == null || !g.p[1]) return;
    const kills = [0, 0];
    const shots = [0, 0];
    for (const v of g.volleys) {
      shots[v.by]++;
      kills[v.by] += v.dead || 0;
    }
    const winner = res.winner === -1 ? null : g.p[res.winner].id;
    const log = JSON.stringify({ codes: g.p.map((p) => p.secret), volleys: g.volleys, powers: g.powers });
    const db = this.env.DB;
    const stmts = [
      db.prepare("INSERT OR IGNORE INTO matches (id, room, p1, p2, winner, reason, volleys, started_at, ended_at, log) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)")
        .bind(`${g.code}-${g.created}-${g.match}`, g.code, g.p[0].id, g.p[1].id, winner, res.reason, g.volleys.length, g.started, res.at, log),
    ];
    for (const s of [0, 1]) {
      const col = res.winner === -1 ? "draws" : res.winner === s ? "wins" : "losses";
      if (col === "wins" && res.reason === "cracked") {
        stmts.push(db.prepare("UPDATE players SET wins = wins + 1, kills = kills + ?1, best = MIN(COALESCE(best, 999), ?3) WHERE id = ?2").bind(kills[s], g.p[s].id, shots[s]));
      } else {
        stmts.push(db.prepare(`UPDATE players SET ${col} = ${col} + 1, kills = kills + ?1 WHERE id = ?2`).bind(kills[s], g.p[s].id));
      }
    }
    try {
      await db.batch(stmts);
    } catch (e) {
      console.error("could not record the match", e);
    }
  }
}
