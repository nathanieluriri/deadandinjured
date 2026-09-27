import { Room } from "./room.js";
import { Lobby } from "./lobby.js";
import { currentPlayer, startSession, endSession, cookieFor, enlist, login, hashPassword, publicPlayer } from "./auth.js";
import { roomCode, ROOM_RE, cleanOrders } from "../shared/rules.js";

export { Room, Lobby };

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } });

const sameOrigin = (req, url) => {
  const origin = req.headers.get("Origin");
  return !origin || new URL(origin).host === url.host;
};

async function body(req) {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? b : {};
  } catch {
    return {};
  }
}

async function signedIn(env, url, id, status = 200) {
  const token = await startSession(env, id);
  const p = await env.DB.prepare("SELECT * FROM players WHERE id = ?1").bind(id).first();
  return json({ player: publicPlayer(p) }, status, { "Set-Cookie": cookieFor(token, url) });
}

async function api(req, env, url) {
  const path = url.pathname;
  if (req.method === "POST" && !sameOrigin(req, url)) return json({ error: "Bad origin" }, 403);

  if (path === "/api/me" && req.method === "GET") return json({ player: publicPlayer(await currentPlayer(req, env)) });

  if (path === "/api/enlist" && req.method === "POST") {
    const me = await currentPlayer(req, env);
    if (me) return json({ player: publicPlayer(me) });
    const r = await enlist(env, (await body(req)).name);
    if (r.error) return json({ error: r.error }, 409);
    return signedIn(env, url, r.id, 201);
  }

  if (path === "/api/login" && req.method === "POST") {
    const b = await body(req);
    const r = await login(env, b.name, b.password);
    if (r.error) return json({ error: r.error }, 401);
    return signedIn(env, url, r.id);
  }

  if (path === "/api/logout" && req.method === "POST") {
    await endSession(req, env);
    return json({ ok: true }, 200, { "Set-Cookie": cookieFor(null, url) });
  }

  if (path === "/api/password" && req.method === "POST") {
    const me = await currentPlayer(req, env);
    if (!me) return json({ error: "Pick a callsign first" }, 401);
    const password = String((await body(req)).password || "");
    if (password.length < 8 || password.length > 128) return json({ error: "Use 8 to 128 characters" }, 400);
    await env.DB.prepare("UPDATE players SET pass_hash = ?1 WHERE id = ?2").bind(await hashPassword(password, env), me.id).run();
    return json({ player: { ...publicPlayer(me), secured: true } });
  }

  if (path === "/api/rooms" && req.method === "POST") {
    const me = await currentPlayer(req, env);
    if (!me) return json({ error: "Pick a callsign first" }, 401);
    const orders = cleanOrders((await body(req)).orders);
    for (let i = 0; i < 6; i++) {
      const code = roomCode();
      const room = env.ROOMS.get(env.ROOMS.idFromName(code));
      if ((await room.init({ code, host: { id: me.id, name: me.name }, orders })).ok) return json({ code, orders }, 201);
    }
    return json({ error: "Could not open a room, try again" }, 503);
  }

  const peek = path.match(/^\/api\/rooms\/([A-Za-z0-9]{5})$/);
  if (peek && req.method === "GET") {
    const code = peek[1].toUpperCase();
    if (!ROOM_RE.test(code)) return json({ room: null });
    return json({ room: await env.ROOMS.get(env.ROOMS.idFromName(code)).peek() });
  }

  if (path === "/api/solo" && req.method === "POST") {
    const me = await currentPlayer(req, env);
    if (!me) return json({ ok: false });
    const col = { win: "solo_wins", loss: "solo_losses", draw: "solo_draws" }[(await body(req)).result];
    if (!col) return json({ error: "Win, loss or draw" }, 400);
    await env.DB.prepare(`UPDATE players SET ${col} = ${col} + 1 WHERE id = ?1`).bind(me.id).run();
    return json({ ok: true });
  }

  if (path === "/api/leaderboard" && req.method === "GET") {
    const { results } = await env.DB.prepare(
      "SELECT name, wins, losses, draws, kills, best FROM players WHERE wins + losses + draws > 0 ORDER BY wins DESC, losses ASC, kills DESC LIMIT 20",
    ).all();
    return json({ players: results }, 200, { "Cache-Control": "public, max-age=30" });
  }

  return json({ error: "Not found" }, 404);
}

async function socket(req, env, url) {
  if (req.headers.get("Upgrade") !== "websocket") return new Response("Expected a websocket", { status: 426 });
  if (!sameOrigin(req, url)) return new Response("Bad origin", { status: 403 });
  const me = await currentPlayer(req, env);
  if (!me) return new Response("Pick a callsign first", { status: 401 });
  let stub;
  const room = url.pathname.match(/^\/ws\/room\/([A-Za-z0-9]{5})$/);
  if (room && ROOM_RE.test(room[1].toUpperCase())) stub = env.ROOMS.get(env.ROOMS.idFromName(room[1].toUpperCase()));
  else if (url.pathname === "/ws/lobby") stub = env.LOBBY.get(env.LOBBY.idFromName("global"));
  else return new Response("Not found", { status: 404 });
  const fwd = new Request(req);
  fwd.headers.set("x-pid", me.id);
  fwd.headers.set("x-name", me.name);
  return stub.fetch(fwd);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname.startsWith("/ws/")) return await socket(req, env, url);
      if (url.pathname.startsWith("/api/")) return await api(req, env, url);
    } catch (e) {
      console.error(e);
      return json({ error: "Something broke on our side" }, 500);
    }
    return env.ASSETS.fetch(req);
  },
};
