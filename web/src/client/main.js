import { gsap } from "gsap/gsap-core";
import { Stage } from "./scene/stage.js";
import { World, loadProps } from "./scene/world.js";
import { Army, loadSoldier } from "./scene/army.js";
import { Fx } from "./scene/fx.js";
import { Director } from "./scene/director.js";
import { LogoHud } from "./scene/logo.js";
import { Sfx } from "./audio.js";
import { MatchView } from "./match.js";
import { RemoteMatch, LocalMatch, quickMatch } from "./net.js";
import { ROOM_RE, STANDARD_ORDERS, cleanOrders } from "../shared/rules.js";
import { LEVELS } from "./ai.js";

const $ = (id) => document.getElementById(id);
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const fine = matchMedia("(pointer: fine)").matches;

async function api(path, body) {
  const r = await fetch(path, body === undefined ? { credentials: "same-origin" } : {
    method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || "The radio is down. Try again."), { status: r.status });
  return data;
}

function grain() {
  const c = document.createElement("canvas");
  c.width = c.height = 160;
  const x = c.getContext("2d");
  const img = x.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  document.querySelector(".grain").style.backgroundImage = `url(${c.toDataURL("image/png")})`;
}

const store = (k, v) => {
  try {
    if (v === undefined) return localStorage.getItem(k);
    localStorage.setItem(k, v);
  } catch {}
  return null;
};

class App {
  constructor() {
    this.me = null;
    this.screen = "pre";
    this.match = null;
    let saved = null;
    try { saved = JSON.parse(store("di.orders") || "null"); } catch {}
    this.orders = cleanOrders(saved || STANDARD_ORDERS);
  }

  setOrders(o) {
    this.orders = cleanOrders(o);
    store("di.orders", JSON.stringify(this.orders));
    this.lobby?.setOrders(this.orders);
  }

  progress(f) {
    $("preBar").style.transform = `scaleX(${f})`;
  }

  async boot() {
    const soldier = loadSoldier(SOLDIER_URL);
    const props = loadProps(PROPS_URL);
    for (const p of [soldier, props]) p.catch(() => {});
    if (/[?&]film\b/.test(location.search)) document.documentElement.classList.add("film");
    grain();
    this.progress(0.08);
    await frame();
    const iconMode = location.search.match(/[?&]icon(?:=(\w+))?/);
    this.stage = new Stage($("gl"), { alpha: !!iconMode && /[?&]clear\b/.test(location.search) });
    this.stage.worldOn = false;
    this.hud = new LogoHud(this.stage);
    if (iconMode) return this.icon(iconMode[1] === "injured" ? "injured" : "dead");
    $("pre").classList.add("live");
    this.world = new World(this.stage);
    this.world.dress(await props);
    this.progress(0.4);
    await frame();
    this.army = new Army(this.stage, await soldier);
    this.fx = new Fx(this.stage, this.world);
    this.sfx = new Sfx();
    this.progress(0.6);
    await frame();
    this.director = new Director({ stage: this.stage, world: this.world, army: this.army, fx: this.fx, sfx: this.sfx });
    this.director.applyShot("title", true);
    this.director.titleShow(true);
    this.fx.warm();
    this.stage.renderer.compile(this.stage.scene, this.stage.camera);
    for (const l of Object.values(this.hud.logos)) l.root.visible = true;
    this.stage.renderer.compile(this.hud.scene, this.hud.camera);
    for (const l of Object.values(this.hud.logos)) l.root.visible = false;
    this.progress(0.85);
    await frame();
    this.director.titleShow(false);
    this.view = new MatchView(this);
    this.bindUi();
    this.layout();
    await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1500))]);
    this.me = (await api("/api/me").catch(() => ({ player: null }))).player;
    this.renderWho();
    this.progress(1);
    this.hud.onResize = () => this.placePre();
    this.placePre();
    this.hud.stackIn("dead", 0.1);
    this.hud.stackIn("injured", 0.35);
    const enter = $("enterBtn");
    enter.disabled = false;
    enter.textContent = "Enter the field";
    if (fine) enter.focus({ preventScroll: true });
    (window.requestIdleCallback || setTimeout)(() => this.director.prebuildWords());
  }

  // The two logos frame the title: dead beside DEAD, injured beside INJURED, or both above
  // it when the screen is too narrow to fit them alongside.
  placePre() {
    const [a, b] = document.querySelectorAll(".pre-title span");
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    const size = Math.min(ra.height * 1.12, 140);
    const w = size * 0.89;
    const gap = size * 0.28;
    if (size >= 70 && ra.left - gap - w > 12 && rb.right + gap + w < innerWidth - 12) {
      this.hud.place("dead", ra.left - gap - w / 2, ra.top + ra.height * 0.5, size);
      this.hud.place("injured", rb.right + gap + w / 2, rb.top + rb.height * 0.5, size);
    } else {
      const s2 = Math.min(Math.max(size * 1.1, 76), 96);
      const y = ra.top - s2 * 0.62 - 18;
      this.hud.place("dead", innerWidth / 2 - s2 * 0.62, y, s2);
      this.hud.place("injured", innerWidth / 2 + s2 * 0.62, y, s2);
    }
  }

  icon(kind) {
    document.documentElement.classList.add("icon");
    document.body.classList.add("icon");
    const size = Math.min(innerWidth, innerHeight) * (/[?&]clear\b/.test(location.search) ? 0.9 : 0.74);
    this.hud.place(kind, innerWidth / 2, innerHeight / 2, size);
    this.hud.stackIn(kind, 0);
    this.hud.state[kind].still = true;
    window.__iconReady = true;
  }

  enter() {
    this.sfx.unlock();
    this.sfx.play("boom", { far: 0.3 });
    this.hud.onResize = null;
    this.hud.breakOut("dead", 0);
    this.hud.breakOut("injured", 0.08);
    this.stage.worldOn = true;
    $("pre").classList.add("gone");
    document.body.classList.remove("is-pre");
    this.sfx.mood("menu");
    const room = location.pathname.match(/^\/r\/([A-Za-z0-9]{5})\/?$/);
    if (room) {
      this.director.shot("home", 0.01);
      this.join(room[1].toUpperCase());
    } else this.menu(true);
  }

  show(name) {
    this.screen = name;
    document.body.dataset.screen = name;
    this.layout();
    clearInterval(this.warTimer);
    if (name === "menu") this.warTimer = setInterval(() => this.screen === "menu" && !document.hidden && this.director.distant(), 7000 + Math.random() * 6000);
  }

  // The 3D view centres itself in whatever the panels leave open.
  layout() {
    if (!this.stage) return;
    requestAnimationFrame(() => {
      let bottom = 0;
      let top = 0;
      const b = document.body;
      // A cinematic frames the whole screen and restores the layout when it ends.
      if (b.classList.contains("cine")) return;
      if (this.screen === "match") {
        // Measured to the top of the aim pane whichever pane is open, so switching tabs never moves the camera.
        if (b.classList.contains("phase-deploy") || b.classList.contains("phase-battle")) bottom = ($("dock").getBoundingClientRect().bottom - $("paneAim").getBoundingClientRect().top + 14) * (innerWidth < 900 ? 0.9 : 0.55);
        else if (b.classList.contains("phase-supply")) bottom = $("rps").getBoundingClientRect().height + 20;
        else if (b.classList.contains("phase-over")) bottom = innerWidth < 900 ? 220 : 0;
        top = innerWidth < 900 ? 100 : 50;
      } else if (this.screen === "menu") {
        bottom = innerWidth < 900 ? Math.min(330, innerHeight * 0.42) : 0;
      } else if (this.screen === "wait" || this.screen === "search") bottom = innerWidth < 900 ? 280 : 120;
      this.stage.setInset(Math.round(top), Math.round(bottom));
    });
  }

  toast(text) {
    const t = $("toast");
    t.textContent = text;
    t.classList.add("on");
    clearTimeout(this.toastOff);
    this.toastOff = setTimeout(() => t.classList.remove("on"), 2600);
  }

  bindUi() {
    $("enterBtn").addEventListener("click", () => this.enter());
    $("brand").addEventListener("click", () => {
      if (this.screen === "match" && this.view.s && !["over", "lobby"].includes(this.view.s.phase)) return $("leaveBtn").click();
      if (this.screen !== "menu" && this.screen !== "pre") this.home();
    });
    const sound = $("soundBtn");
    sound.setAttribute("aria-pressed", String(this.sfx.enabled));
    sound.addEventListener("click", () => {
      this.sfx.unlock();
      this.sfx.setEnabled(!this.sfx.enabled);
      sound.setAttribute("aria-pressed", String(this.sfx.enabled));
      this.sfx.play("click");
    });
    $("manualBtn").addEventListener("click", () => {
      this.sfx.play("click");
      $("manualDlg").showModal();
    });
    for (const b of document.querySelectorAll("[data-close]")) b.addEventListener("click", () => b.closest("dialog").close("cancel"));
    for (const item of document.querySelectorAll("[data-open]")) {
      item.addEventListener("click", () => {
        const sub = $(item.dataset.open);
        const open = sub.hidden;
        for (const s of document.querySelectorAll(".sub")) s.hidden = true;
        for (const i of document.querySelectorAll("[data-open]")) i.setAttribute("aria-expanded", "false");
        sub.hidden = !open;
        item.setAttribute("aria-expanded", String(open));
        this.sfx.play("click");
        this.layout();
      });
    }
    for (const b of document.querySelectorAll("[data-level]")) b.addEventListener("click", () => this.solo(b.dataset.level));
    $("createBtn").addEventListener("click", () => this.create());
    $("joinForm").addEventListener("submit", (e) => {
      e.preventDefault();
      this.join($("joinCode").value.trim().toUpperCase());
    });
    $("quickBtn").addEventListener("click", () => this.quick());
    $("boardBtn").addEventListener("click", () => this.board());
    $("cancelWait").addEventListener("click", () => this.home());
    $("cancelSearch").addEventListener("click", () => this.home());
    $("searchSolo").addEventListener("click", () => this.solo("sergeant"));
    $("shareBtn").addEventListener("click", () => this.share());
    $("enlistSwap").addEventListener("click", () => this.enlistMode(!this.signingIn));
    $("enlistCancel").addEventListener("click", () => $("enlistDlg").close("cancel"));
    $("enlistForm").addEventListener("submit", (e) => this.enlistSubmit(e));
    $("secureForm").addEventListener("submit", (e) => this.secureSubmit(e));
    $("who").addEventListener("click", (e) => {
      const a = e.target.closest("[data-act]");
      if (!a) return;
      if (a.dataset.act === "secure") $("secureDlg").showModal();
      if (a.dataset.act === "signin") this.needCallsign(true);
      if (a.dataset.act === "signout") this.signOut();
    });
    if (fine) {
      document.addEventListener("pointerover", (e) => {
        const t = e.target.closest?.(".item, .chip, .btn, .tool, .rps button, .link");
        if (t && t !== this.hovered && !t.disabled) this.sfx.play("hover");
        this.hovered = t;
      });
    }
    document.addEventListener("click", (e) => {
      if (e.target.closest?.(".chip, .btn, .link:not(#soundBtn), .tool")) this.sfx.play("click");
    });
    addEventListener("resize", () => this.layout());
  }

  renderWho() {
    const w = $("who");
    const p = this.me;
    if (!p) {
      w.innerHTML = `<span>No callsign yet.</span><button type="button" class="link" data-act="signin">Sign in</button>`;
      return;
    }
    const rec = p.wins + p.losses + p.draws ? `${p.wins} won, ${p.losses} lost` : "no live matches yet";
    w.innerHTML = `<span>Callsign <b>${escapeHtml(p.name)}</b></span><span>${rec}</span>` +
      (p.secured ? `<button type="button" class="link" data-act="signout">Sign out</button>` : `<button type="button" class="link" data-act="secure">Add a password</button>`);
  }

  async refreshMe() {
    this.me = (await api("/api/me").catch(() => ({ player: this.me }))).player;
    this.renderWho();
  }

  menu(first = false) {
    this.show("menu");
    this.view.stop();
    this.director.resetField();
    this.director.rpsShow(false);
    this.director.shot("title", first ? 0.01 : 1.6);
    if (first || !this.director.titleGroup.visible) this.director.titleIn();
    this.sfx.mood("menu");
    for (const s of document.querySelectorAll(".sub")) s.hidden = true;
    for (const i of document.querySelectorAll("[data-open]")) i.setAttribute("aria-expanded", "false");
    if (location.pathname !== "/") history.replaceState(null, "", "/");
  }

  home() {
    this.hud.hide();
    this.lobby?.cancel();
    this.lobby = null;
    this.view.stop();
    for (const d of document.querySelectorAll("dialog[open]")) d.close("cancel");
    this.menu();
  }

  onPhase(phase) {
    if (phase === "lobby") {
      if (this.screen !== "wait") this.show("wait");
      return;
    }
    if (this.screen !== "match") {
      this.show("match");
      if (this.director.titleGroup.visible) this.director.titleOut();
    }
  }

  async needCallsign(signIn = false) {
    if (this.me && !signIn) return true;
    this.enlistMode(signIn);
    $("enlistErr").textContent = "";
    $("enlistName").value = signIn ? "" : $("enlistName").value;
    $("enlistDlg").showModal();
    return new Promise((resolve) => {
      this.enlistDone = resolve;
      $("enlistDlg").addEventListener("close", () => {
        if (this.enlistDone) {
          this.enlistDone(!!this.me && $("enlistDlg").returnValue === "ok");
          this.enlistDone = null;
        }
      }, { once: true });
    });
  }

  enlistMode(signIn) {
    this.signingIn = signIn;
    $("enlistTitle").textContent = signIn ? "sign.in" : "enlist";
    $("enlistHead").textContent = signIn ? "Welcome back" : "Pick a callsign";
    $("enlistText").textContent = signIn ? "Sign in with your callsign and password." : "It is the name your opponents see and the one on the leaderboard.";
    $("passField").hidden = !signIn;
    $("enlistPass").required = signIn;
    $("enlistGo").textContent = signIn ? "Sign in" : "Enlist";
    $("enlistSwap").textContent = signIn ? "I need a callsign" : "I have a callsign";
    $("enlistErr").textContent = "";
  }

  async enlistSubmit(e) {
    e.preventDefault();
    const name = $("enlistName").value;
    const btn = $("enlistGo");
    btn.disabled = true;
    try {
      const r = this.signingIn ? await api("/api/login", { name, password: $("enlistPass").value }) : await api("/api/enlist", { name });
      this.me = r.player;
      this.renderWho();
      this.sfx.play("lock");
      $("enlistDlg").close("ok");
    } catch (err) {
      $("enlistErr").textContent = err.message;
      this.sfx.play("error");
    } finally {
      btn.disabled = false;
      $("enlistPass").value = "";
    }
  }

  async secureSubmit(e) {
    e.preventDefault();
    try {
      const r = await api("/api/password", { password: $("securePass").value });
      this.me = r.player;
      this.renderWho();
      $("secureDlg").close("ok");
      this.toast("Password saved. Sign in anywhere with your callsign.");
    } catch (err) {
      $("secureErr").textContent = err.message;
    } finally {
      $("securePass").value = "";
    }
  }

  async signOut() {
    await api("/api/logout", {}).catch(() => {});
    this.me = null;
    this.renderWho();
    this.toast("Signed out");
  }

  solo(level) {
    this.lobby?.cancel();
    this.lobby = null;
    const name = this.me?.name || "You";
    this.show("match");
    this.director.titleOut();
    const view = this.view;
    view.start(null, { solo: true, level });
    view.conn = new LocalMatch(level, name, (m) => view.message(m), this.orders);
    this.toast(`${LEVELS[level].name}: ${LEVELS[level].note.toLowerCase()}`);
  }

  async create() {
    if (!(await this.needCallsign())) return;
    try {
      const { code } = await api("/api/rooms", { orders: this.orders });
      this.openRoom(code, true);
    } catch (err) {
      this.toast(err.message);
    }
  }

  async join(code) {
    if (!ROOM_RE.test(code)) {
      this.sfx.play("error");
      return this.toast("Room codes are five letters and digits");
    }
    if (!(await this.needCallsign())) {
      if (this.screen !== "menu") this.menu();
      return;
    }
    try {
      const { room } = await api(`/api/rooms/${code}`);
      if (!room) {
        this.toast("No room with that code");
        if (this.screen !== "menu") this.menu();
        return;
      }
      this.openRoom(code, false);
    } catch (err) {
      this.toast(err.message);
    }
  }

  openRoom(code, host) {
    this.lobby = null;
    history.replaceState(null, "", `/r/${code}`);
    $("roomCode").textContent = code;
    $("waitState").textContent = "waiting";
    if (host) this.show("wait");
    if (this.director.titleGroup.visible) this.director.titleOut();
    this.director.shot("home", 1.4);
    const view = this.view;
    view.start(null, { solo: false });
    view.conn = new RemoteMatch(code, (m) => view.message(m), (status) => this.netStatus(status));
  }

  netStatus(status) {
    if (status === "reconnecting") this.toast("Radio lost, reconnecting");
    if (status === "refused") {
      this.toast("That room is full or closed");
      this.home();
    }
    if (status === "gone") {
      if (this.view.s?.phase !== "over") this.toast("The room has closed");
      if (this.screen !== "match" || this.view.s?.phase !== "over") this.home();
    }
    if (status === "replaced") {
      this.toast("This match is open in another tab");
      this.home();
    }
  }

  async share() {
    const url = `${location.origin}/r/${$("roomCode").textContent}`;
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) await navigator.share({ title: "Dead & Injured", text: "Crack my code if you can.", url });
      else {
        await navigator.clipboard.writeText(url);
        this.toast("Link copied");
      }
    } catch {}
  }

  async quick() {
    if (!(await this.needCallsign())) return;
    this.show("search");
    if (this.director.titleGroup.visible) this.director.titleOut();
    this.director.shot("far", 1.6);
    $("searchText").textContent = "Scanning for an opponent";
    $("searchState").textContent = "scanning";
    this.lobby = quickMatch({
      orders: STANDARD_ORDERS,
      onQueue: (n) => {
        $("searchText").textContent = n > 1 ? `${n} soldiers on the radio` : "Scanning for an opponent";
      },
      onMatched: (code) => {
        this.lobby = null;
        $("searchState").textContent = "found";
        this.sfx.play("found");
        this.openRoom(code, false);
      },
      onFail: () => {
        this.toast("Lost the radio. Try again.");
        this.home();
      },
    });
  }

  async board() {
    this.sfx.play("click");
    const body = $("boardBody");
    body.innerHTML = '<tr><td colspan="5">Loading</td></tr>';
    $("boardDlg").showModal();
    try {
      const { players } = await api("/api/leaderboard");
      body.innerHTML = players.length
        ? players.map((p, i) => `<tr class="${p.name === this.me?.name ? "me" : ""}"><td>${i + 1}</td><td>${escapeHtml(p.name)}</td><td>${p.wins}</td><td>${p.losses}</td><td>${p.kills}</td></tr>`).join("")
        : '<tr><td colspan="5">No live matches fought yet. Be the first.</td></tr>';
    } catch {
      body.innerHTML = '<tr><td colspan="5">The radio is down.</td></tr>';
    }
  }

  recordSolo(result) {
    if (this.me) api("/api/solo", { result }).catch(() => {});
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

const app = new App();
window.__app = app;
app.boot().catch((e) => {
  console.error(e);
  $("enterBtn").textContent = "This device could not start the 3D field";
});
gsap.config({ nullTargetWarn: false });
if (/[?&]nolag\b/.test(location.search)) gsap.ticker.lagSmoothing(0);
