import { gsap } from "gsap/gsap-core";
import { Stage } from "./scene/stage.js";
import { World, loadProps } from "./scene/world.js";
import { Army, loadSoldier } from "./scene/army.js";
import { Fx } from "./scene/fx.js";
import { Director } from "./scene/director.js";
import { LogoHud } from "./scene/logo.js";
import { IconDeck } from "./scene/icons.js";
import { paintTextures, canvases } from "./textures.js";
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
    const textures = paintTextures().catch(() => {});
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
    this.icons = new IconDeck(this.stage, { environment: this.world.envRT.texture, props: await props });
    this.stage.restores.push(() => (this.icons.scene.environment = this.world.envRT.texture));
    this.gfx(store("di.gfx") || "auto");
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
    this.bindIcons();
    this.bindUi();
    this.bindPause();
    await textures;
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
    this.icons.on = name === "match";
    this.layout();
    clearInterval(this.warTimer);
    if (name === "menu") this.warTimer = setInterval(() => this.screen === "menu" && !document.hidden && this.director.distant(), 7000 + Math.random() * 6000);
  }

  // Every tool on the bar, the pause stud and the draw's hands get their clay object.
  bindIcons() {
    const ic = this.icons;
    ic.addBoard("plank", $("plank"), canvases.plank);
    ic.addBoard("hands", $("rps"), canvases.plank);
    ic.addBoard("ends", $("ends"), canvases.plank);
    ic.add("phone", $("phoneIc"), { size: 1, hit: $("rematchBtn") });
    ic.add("signpost", $("signIc"), { size: 1, hit: $("homeBtn") });
    for (const b of document.querySelectorAll("#bar [data-open]")) ic.add(b.dataset.open, b, { size: 0.9 });
    for (const b of document.querySelectorAll("#rps [data-pick]")) ic.add(b.dataset.pick, b, { size: 0.9 });
    ic.add("crate", $("tbCrate"), { size: 0.95 });
    ic.add("pause", $("pauseBtn"), { size: 0.86 });
    // The whole bar is compiled now, so the first match does not stall on it.
    ic.on = true;
    for (const it of ic.items.values()) it.root.visible = true;
    this.stage.renderer.compile(ic.scene, ic.camera);
    for (const it of ic.items.values()) it.root.visible = false;
    ic.on = false;
  }

  // Auto lets the renderer trade resolution for frame rate; Sharp holds it at the top; Fast caps
  // it low for slow phones.
  gfx(mode) {
    const st = this.stage;
    const top = st.top ?? st.cap;
    st.top = top;
    if (mode === "sharp") {
      st.cap = top;
      st.dpr = top;
      st.adaptive = false;
    } else if (mode === "fast") {
      st.cap = Math.min(top, 1);
      st.dpr = Math.min(st.dpr, st.cap);
      st.adaptive = !window.__vclock;
    } else {
      mode = "auto";
      st.cap = top;
      st.adaptive = !window.__vclock && !/[?&]hq\b/.test(location.search);
    }
    st.floor = Math.min(st.floor, st.cap);
    this.gfxMode = mode;
    store("di.gfx", mode);
    for (const b of document.querySelectorAll("[data-gfx]")) b.setAttribute("aria-checked", String(b.dataset.gfx === mode));
  }

  // ---- the pause menu ------------------------------------------------------------------------

  bindPause() {
    const dlg = $("pauseDlg");
    $("pauseBtn").addEventListener("click", () => this.pause());
    dlg.addEventListener("cancel", (e) => {
      if (!$("quitConfirm").hidden) {
        e.preventDefault();
        this.quitAsk(false);
      }
    });
    dlg.addEventListener("close", () => this.unpause());
    dlg.addEventListener("click", (e) => {
      if (e.target === dlg) return dlg.close();
      const b = e.target.closest("[data-p], [data-gfx]");
      if (!b) return;
      this.sfx.play("paper");
      if (b.dataset.gfx) return this.gfx(b.dataset.gfx);
      const p = b.dataset.p;
      if (p === "resume") dlg.close();
      else if (p === "manual") $("manualDlg").showModal();
      else if (p === "effects") this.sfx.setEffects(!this.sfx.effects);
      else if (p === "music") this.sfx.setMusic(!this.sfx.music);
      else if (p === "quit") this.quitAsk(true);
      else if (p === "stay") this.quitAsk(false);
      else if (p === "leave") this.quit();
      else if (p === "intro") {
        dlg.close();
        this.replayIntro?.();
      }
      this.pauseState();
    });
    this.pauseTicker = setInterval(() => dlg.open && this.pauseState(), 250);
  }

  inMatch() {
    const s = this.view.s;
    return this.screen === "match" && s && !["over", "lobby"].includes(s.phase);
  }

  pause() {
    const dlg = $("pauseDlg");
    if (dlg.open || this.screen !== "match") return;
    this.quitAsk(false);
    const solo = this.view.solo && this.inMatch();
    if (solo) this.freeze(true);
    $("pauseTag").textContent = solo ? "Halted" : this.inMatch() ? "The war goes on" : "At ease";
    this.pauseState();
    this.sfx.play("paper");
    dlg.showModal();
    dlg.querySelector('[data-p="resume"]').focus({ preventScroll: true });
  }

  unpause() {
    this.freeze(false);
  }

  // Against the computer, pause stops the world: every animation, the clock and its thinking.
  freeze(on) {
    const conn = this.view.conn;
    if (on === !!this.frozen) return;
    this.frozen = on;
    if (on) {
      conn?.pause?.();
      gsap.globalTimeline.pause();
      this.savedScale = this.stage.timeScale;
      this.stage.timeScale = 0;
      this.sfx.freeze(true);
    } else {
      this.stage.timeScale = this.savedScale ?? 1;
      gsap.globalTimeline.resume();
      conn?.resume?.();
      this.sfx.freeze(false);
    }
  }

  pauseState() {
    const s = this.view.s;
    const note = $("pauseNote");
    const live = this.inMatch() && !this.view.solo;
    let text = "";
    if (live) {
      const now = Date.now() + (this.view.offset || 0);
      const turn = s.deadline ? Math.max(0, Math.ceil((s.deadline - now) / 1000)) : null;
      const clock = s.clock ? Math.max(0, Math.ceil((s.clock - now) / 1000)) : null;
      const who = s.turn === "me" ? "Your turn is running" : `${s.opp?.name || "The enemy"}'s turn is running`;
      const parts = [];
      if (s.phase === "battle" && turn != null) parts.push(`${who}: ${turn}s left.`);
      if (clock != null) parts.push(`Match clock ${Math.floor(clock / 60)}:${String(clock % 60).padStart(2, "0")}.`);
      text = `A live match cannot stop. ${parts.join(" ")}`;
    } else if (this.inMatch()) text = "The field is frozen until you return.";
    if (note.textContent !== text) note.textContent = text;
    note.hidden = !text;
    for (const [k, on] of [["effects", this.sfx.effects], ["music", this.sfx.music]]) document.querySelector(`[data-p="${k}"]`).setAttribute("aria-pressed", String(on));
    $("introRow").hidden = !this.replayIntro;
    document.querySelector('[data-p="quit"]').textContent = this.inMatch() ? "Quit game" : "Back to base";
  }

  quitAsk(on) {
    const ask = on && this.inMatch();
    if (on && !ask) return this.quit();
    $("quitConfirm").hidden = !ask;
    $("pauseList").hidden = ask;
    if (ask) {
      $("leaveText").textContent = this.view.solo ? `The computer keeps the field: this counts as a loss.` : `Leaving now hands the win to ${this.view.s?.opp?.name || "your opponent"}.`;
      document.querySelector('[data-p="stay"]').focus({ preventScroll: true });
    } else if (on === false && !$("pauseDlg").hidden) document.querySelector('[data-p="resume"]')?.focus({ preventScroll: true });
  }

  quit() {
    const dlg = $("pauseDlg");
    const leaving = this.inMatch();
    if (leaving) {
      this.view.conn?.send({ t: "leave" });
      if (this.view.solo) this.recordSolo("loss");
    }
    this.quitAsk(false);
    dlg.close();
    this.home();
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
        // Set by the bar and the keypad's height, open or not, so opening windows never moves the camera.
        const bar = $("bar").getBoundingClientRect().height || 72;
        if (b.classList.contains("phase-deploy") || b.classList.contains("phase-battle")) bottom = innerWidth < 900 ? (bar + 360) * 0.9 : innerWidth < 1180 ? (bar + 375) * 0.62 : (bar + 190) * 0.6;
        else if (b.classList.contains("phase-supply")) bottom = bar + 20;
        else if (b.classList.contains("phase-over")) {
          // On a phone the telegram takes the lower half, so the scene moves up above it.
          const told = b.classList.contains("told");
          const over = $("over").getBoundingClientRect();
          bottom = told && innerWidth < 900 ? innerHeight - over.top + 8 : bar;
        }
        top = innerWidth < 900 ? 100 : 50;
      } else if (this.screen === "menu") {
        bottom = innerWidth < 900 ? Math.min(330, innerHeight * 0.42) : 0;
      } else if (this.screen === "wait" || this.screen === "search") bottom = innerWidth < 900 ? 280 : 120;
      this.stage.setInset(Math.round(top), Math.round(bottom), this.screen === "match");
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
      if (this.screen === "match") return this.pause();
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
    for (const item of document.querySelectorAll("#menu [data-open]")) {
      item.addEventListener("click", () => {
        const sub = $(item.dataset.open);
        const open = sub.hidden;
        for (const s of document.querySelectorAll(".sub")) s.hidden = true;
        for (const i of document.querySelectorAll("#menu [data-open]")) i.setAttribute("aria-expanded", "false");
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
    for (const i of document.querySelectorAll("#menu [data-open]")) i.setAttribute("aria-expanded", "false");
    if (location.pathname !== "/") history.replaceState(null, "", "/");
  }

  home() {
    this.freeze(false);
    if ($("pauseDlg").open) $("pauseDlg").close();
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
