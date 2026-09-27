import { DurableObject } from "cloudflare:workers";
import { roomCode, cleanOrders, packOrders } from "../shared/rules.js";

// Quick match: one queue for everyone. Two soldiers who are searching get a fresh room with
// both seats reserved, and both sockets are told its code. Each brings their own orders (in the
// socket's URL, then updated while they wait); the room's supply draw decides whose stand.
export class Lobby extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.queue = Promise.resolve();
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
  }

  async fetch(req) {
    if (req.headers.get("Upgrade") !== "websocket") return new Response("Expected a websocket", { status: 426 });
    const id = req.headers.get("x-pid");
    const name = req.headers.get("x-name");
    const orders = packOrders(new URL(req.url).searchParams.get("o"));
    for (const old of this.ctx.getWebSockets(id)) {
      try { old.close(4001, "Searching in another tab"); } catch {}
    }
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, [id]);
    server.serializeAttachment({ id, name, at: Date.now(), orders });
    this.match();
    return new Response(null, { status: 101, webSocket: client });
  }

  match() {
    this.queue = this.queue.then(() => this.pair()).catch((e) => console.error("pairing failed", e));
    return this.queue;
  }

  waiting(except) {
    return this.ctx.getWebSockets()
      .filter((ws) => ws !== except && ws.readyState === WebSocket.OPEN)
      .map((ws) => ({ ws, ...ws.deserializeAttachment() }))
      .filter((x) => x.id)
      .sort((a, b) => a.at - b.at);
  }

  async pair(except) {
    const list = this.waiting(except);
    while (list.length >= 2) {
      const a = list.shift();
      const i = list.findIndex((x) => x.id !== a.id);
      if (i < 0) break;
      const b = list.splice(i, 1)[0];
      let code = null;
      for (let n = 0; n < 6 && !code; n++) {
        const c = roomCode();
        const room = this.env.ROOMS.get(this.env.ROOMS.idFromName(c));
        const offers = [cleanOrders(a.orders), cleanOrders(b.orders)];
        if ((await room.init({ code: c, host: { id: a.id, name: a.name }, guest: { id: b.id, name: b.name }, offers })).ok) code = c;
      }
      if (!code) break;
      for (const x of [a, b]) {
        try {
          x.ws.send(JSON.stringify({ t: "matched", code }));
          x.ws.close(1000, "matched");
        } catch {}
      }
    }
    const n = list.length;
    for (const x of list) {
      try { x.ws.send(JSON.stringify({ t: "queue", n })); } catch {}
    }
  }

  async webSocketMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg?.t !== "orders") return;
    const at = ws.deserializeAttachment();
    if (!at?.id) return;
    ws.serializeAttachment({ ...at, orders: packOrders(msg.orders) });
  }

  async webSocketClose(ws, code) {
    try { ws.close(code === 1005 ? 1000 : code, "bye"); } catch {}
    this.queue = this.queue.then(() => this.pair(ws)).catch(() => {});
  }

  async webSocketError(ws) {
    this.queue = this.queue.then(() => this.pair(ws)).catch(() => {});
  }
}
