import { gsap } from "gsap/gsap-core";
import { Stage } from "./scene/stage.js";
import { World, loadProps } from "./scene/world.js";
import { Network } from "./scene/network.js";
import { Army, loadSoldier } from "./scene/army.js";
import { Fx } from "./scene/fx.js";
import { Director } from "./scene/director.js";
import { LogoHud } from "./scene/logo.js";
import { IconDeck } from "./scene/icons.js";
import { paintTextures, canvases } from "./textures.js";
import { Sfx } from "./audio.js";
import { MatchView } from "./match.js";
import { Title } from "./title.js";
import { RemoteMatch, LocalMatch, quickMatch } from "./net.js";
import { ROOM_RE, STANDARD_ORDERS, cleanOrders } from "../shared/rules.js";
import { LEVELS } from "./ai.js";

const $ = (id) => document.getElementById(id);
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const fine = matchMedia("(pointer: fine)").matches;
const coarse = matchMedia("(pointer: coarse)").matches;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

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
    const q = new URLSearchParams(location.search);
    this.googleSaid = q.get("google");
    this.googleNew = this.googleSaid === "new";
    if (this.googleSaid) {
      q.delete("google");
      history.replaceState(null, "", location.pathname + (String(q) ? `?${q}` : ""));
    }
  }

  setOrders(o) {
    this.orders = cleanOrders(o);
    store("di.orders", JSON.stringify(this.orders));
    this.network?.orders(this.orders);
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
    this.network = new Network(this.world.scene);
    await this.network.build();
    this.network.orders(this.orders);
    this.stage.hooks.push((dt) => this.network.update(dt));
    this.progress(0.4);
    await frame();
    this.army = new Army(this.stage, await soldier);
    this.fx = new Fx(this.stage, this.world);
    this.sfx = new Sfx();
    this.icons = new IconDeck(this.stage, { environment: this.world.envRT.texture, props: await props, envFor: (r) => this.world.envFor(r) });
    this.stage.restores.push(() => (this.icons.scene.environment = this.world.envRT.texture));
    this.gfx(store("di.gfx") || "auto");
    this.progress(0.6);
    await frame();
    this.director = new Director({ stage: this.stage, world: this.world, army: this.army, fx: this.fx, sfx: this.sfx });
    this.director.onParadeEnd = () => this.parade(false);
    this.director.applyShot("corner", true);
    this.fx.warm();
    this.warm(this.stage.scene, this.stage.camera);
    for (const l of Object.values(this.hud.logos)) l.root.visible = true;
    this.warm(this.hud.scene, this.hud.camera);
    for (const l of Object.values(this.hud.logos)) l.root.visible = false;
    this.progress(0.85);
    await frame();
    this.view = new MatchView(this);
    this.title = new Title(this);
    this.replayIntro = () => this.title.replayIntro();
    this.bindIcons();
    this.bindUi();
    this.bindPause();
    await textures;
    this.layout();
    await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1500))]);
    const me = await api("/api/me").catch(() => ({ player: null }));
    this.me = me.player;
    this.googleOn = !!me.google;
    this.renderWho();
    if (this.warming) await Promise.race([Promise.all(this.warming), new Promise((r) => setTimeout(r, 8000))]);
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
    this.menu(true, !room && !this.googleSaid);
    if (room) this.title.link(room[1].toUpperCase());
    this.googleSays(!room);
  }

  show(name) {
    this.screen = name;
    document.body.dataset.screen = name;
    this.icons.on = name === "match";
    this.network.live = name === "menu";
    this.layout();
    clearInterval(this.warTimer);
    if (name === "menu" && !reduced()) this.warTimer = setInterval(() => this.screen === "menu" && !document.hidden && this.director.distant(), 7000 + Math.random() * 6000);
  }

  // Every shader is compiled while loading. A phone compiles them in parallel and the loading bar
  // waits for all of them, so none is first built in the middle of a match.
  warm(scene, camera) {
    if (!coarse) return this.stage.renderer.compile(scene, camera);
    (this.warming ||= []).push(this.stage.renderer.compileAsync(scene, camera));
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
    this.warm(ic.scene, ic.camera);
    if (ic.bar) this.warming.push(ic.compileBar(), ic.warmFilm());
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
    return this.screen === "match" && s && !["over", "lobby"].includes(s.phase) && !this.view.ended;
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
    // Replaying the intro leaves the field, so it is offered only once a match is over.
    $("introRow").hidden = !this.replayIntro || this.inMatch() || reduced();
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
    for (const h of this.title?.hotEls || []) h.w = 0;
    requestAnimationFrame(() => {
      let bottom = 0;
      let top = 0;
      let side = 0;
      const b = document.body;
      // A cinematic frames the whole screen and restores the layout when it ends.
      if (b.classList.contains("cine")) return;
      if (this.screen === "match") {
        // Set by the bar and the keypad's height, open or not, so opening windows never moves the camera.
        const bar = $("bar").getBoundingClientRect().height || 72;
        document.documentElement.style.setProperty("--plankH", `${Math.round(bar)}px`);
        if (b.classList.contains("phase-deploy") || b.classList.contains("phase-battle")) bottom = innerWidth < 900 ? (bar + 360) * 0.9 : innerWidth < 1180 ? (bar + 375) * 0.62 : (bar + 190) * 0.6;
        else if (b.classList.contains("phase-supply")) bottom = bar + 20;
        else if (b.classList.contains("phase-over")) {
          // On an upright phone the telegram takes the lower half, so the scene moves up above it.
          const below = b.classList.contains("told") && innerWidth < 900 && innerHeight > 520;
          bottom = below ? innerHeight - $("over").getBoundingClientRect().top + 8 : bar;
        }
        top = innerWidth < 900 ? 100 : 50;
      } else if (this.screen === "menu") {
        // An open sheet takes the bottom of an upright phone, so the place moves up above it;
        // anywhere else the sheet stands to the right and the place moves left of it.
        const sheet = [...document.querySelectorAll("#menu .sheet")].find((x) => !x.hidden);
        if (sheet && innerWidth < 900 && !matchMedia("(orientation: landscape)").matches) bottom = innerHeight - sheet.getBoundingClientRect().top;
        else if (sheet && sheet.id !== "tagSheet") side = (innerWidth - sheet.getBoundingClientRect().left) * 0.8;
      }
      this.stage.setInset(Math.round(top), Math.round(bottom), this.screen === "match" || this.screen === "menu", Math.round(side));
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
    $("enlistSwap").addEventListener("click", () => this.enlistMode(!this.signingIn));
    $("enlistCancel").addEventListener("click", () => $("enlistDlg").close("cancel"));
    $("enlistForm").addEventListener("submit", (e) => this.enlistSubmit(e));
    $("enlistDlg").addEventListener("close", () => (this.googleNew = false));
    for (const b of document.querySelectorAll("[data-google]")) b.addEventListener("click", () => this.google("in"));
    $("secureForm").addEventListener("submit", (e) => this.secureSubmit(e));
    $("who").addEventListener("click", (e) => {
      const a = e.target.closest("[data-act]");
      if (!a) return;
      if (a.dataset.act === "intro") this.title.replayIntro();
      if (a.dataset.act === "secure") $("secureDlg").showModal();
      if (a.dataset.act === "signin") this.needCallsign(true);
      if (a.dataset.act === "signout") this.signOut();
      if (a.dataset.act === "google") this.google(this.me ? "link" : "in");
    });
    if (fine) {
      document.addEventListener("pointerover", (e) => {
        const t = e.target.closest?.(".hot, .stamp-btn, .link-btn, .back-tag, .btn, .tool, .rps button, .link");
        if (t && t !== this.hovered && !t.disabled) this.sfx.play("hover");
        this.hovered = t;
      });
    }
    document.addEventListener("click", (e) => {
      if (e.target.closest?.(".stamp-btn, .link-btn, .back-tag, .btn, .link:not(#soundBtn), .tool")) this.sfx.play("click");
    });
    addEventListener("resize", () => this.layout());
  }

  renderWho() {
    const w = $("who");
    const p = this.me;
    this.network?.tally(p);
    const intro = reduced() ? "" : `<button type="button" class="link" data-act="intro">Replay the intro</button>`;
    const google = this.googleOn && !p?.google ? `<button type="button" class="link" data-act="google">${p ? "Link Google" : "Sign in with Google"}</button>` : "";
    if (!p) {
      w.innerHTML = `<span>No callsign yet. You get one the first time you play someone live.</span>${google}<button type="button" class="link" data-act="signin">Sign in</button>${intro}`;
      return;
    }
    const rec = p.wins + p.losses + p.draws ? `${p.wins} won, ${p.losses} lost${p.draws ? `, ${p.draws} drawn` : ""}` : "no live matches yet";
    const solo = (p.soloWins || 0) + (p.soloLosses || 0) + (p.soloDraws || 0) ? `Against the computer ${p.soloWins || 0} won, ${p.soloLosses || 0} lost, ${p.soloDraws || 0} drawn` : "";
    w.innerHTML = `<span>Callsign <b>${escapeHtml(p.name)}</b></span><span>${rec}</span>${solo ? `<span>${solo}</span>` : ""}${google}` +
      (p.secured ? `<button type="button" class="link" data-act="signout">Sign out</button>` : `<button type="button" class="link" data-act="secure">Add a password</button>`) + intro;
  }

  // Leaves the page for Google, which sends the browser back to the room being dialled or the corner.
  google(mode) {
    location.assign(`/api/auth/google?${new URLSearchParams({ mode, next: this.dialing ? `/r/${this.dialing}` : "/" })}`);
  }

  googleSays(ask) {
    const said = this.googleSaid;
    this.googleSaid = null;
    const note = {
      in: this.me && `Signed in as ${this.me.name}`,
      linked: "Google linked. Sign in with it on any device.",
      has: "This callsign already has a Google account",
      taken: "That Google account belongs to another callsign",
      fail: "Google sign-in did not go through. Try again.",
      off: "Google sign-in is not set up here",
    }[said];
    if (note) this.toast(note);
    if (said === "new" && ask && !this.me) this.needCallsign();
  }

  async refreshMe() {
    this.me = (await api("/api/me").catch(() => ({ player: this.me }))).player;
    this.renderWho();
  }

  // The title: back in the trench corner, walked to from wherever the camera is. The first
  // visit in a browser flies in over the field.
  menu(first = false, intro = true) {
    this.show("menu");
    this.view.stop();
    this.director.resetField();
    this.parade(true);
    this.director.rpsShow(false);
    let seen = true;
    try {
      seen = localStorage.getItem("di.intro") === "1";
    } catch {}
    this.title.home({ first, intro: first && intro && !seen });
    this.sfx.mood("menu");
    if (location.pathname !== "/") history.replaceState(null, "", "/");
  }

  // The enemy commanders stand on their parapet only while the title is up.
  parade(on) {
    this.army.parade(on);
    this.network.parade(on);
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

  // A room waits in the signals dugout; once both sides are in, the match takes the screen.
  onPhase(phase) {
    if (phase === "lobby" || this.screen === "match") return;
    this.show("match");
    // Joined into a match already under way: no walk out of the trench, and no commanders.
    if (phase !== "supply") {
      this.title.leave();
      this.parade(false);
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
    $("enlistText").textContent = this.googleNew
      ? signIn ? "Sign in once with your callsign and password to link your Google account." : "Your Google account is ready. Pick the callsign to go with it."
      : signIn ? "Sign in with your callsign and password." : "It is the name your opponents see and the one on the leaderboard.";
    $("enlistGoogle").hidden = !this.googleOn || this.googleNew;
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
      if (r.linked) this.toast("Google linked. Sign in with it on any device.");
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
    const view = this.view;
    view.start(null, { solo: true, level });
    view.conn = new LocalMatch(level, name, (m) => view.message(m), this.orders);
    this.toast(`${LEVELS[level].name}: ${LEVELS[level].note.toLowerCase()}`);
  }

  async create() {
    if (!(await this.needCallsign())) return null;
    try {
      const { code } = await api("/api/rooms", { orders: this.orders });
      this.openRoom(code, true);
      return code;
    } catch (err) {
      this.toast(err.message);
      return null;
    }
  }

  // A room's host and orders, before joining it.
  async peekRoom(code) {
    if (!ROOM_RE.test(code)) {
      this.sfx.play("error");
      this.toast("Room codes are five letters and digits");
      return null;
    }
    this.dialing = code;
    const ready = await this.needCallsign();
    this.dialing = null;
    if (!ready) return null;
    try {
      const { room } = await api(`/api/rooms/${code}`);
      if (!room) this.toast("No room with that code");
      return room || null;
    } catch (err) {
      this.toast(err.message);
      return null;
    }
  }

  cancelRoom() {
    this.view.stop();
    if (location.pathname !== "/") history.replaceState(null, "", "/");
  }

  cancelLobby() {
    this.lobby?.cancel();
    this.lobby = null;
  }

  openRoom(code) {
    this.lobby = null;
    history.replaceState(null, "", `/r/${code}`);
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
      const over = this.screen === "match" && this.view.ended;
      if (!over) {
        this.toast("The room has closed");
        this.home();
      } else this.view.lineDown();
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

  // Quick match from the radio post: random orders on the clipboard, which can be changed while
  // the radio searches.
  async quick() {
    if (!(await this.needCallsign())) return this.title.back();
    const orders = this.title.quickOrders();
    $("searchText").textContent = "Scanning the airwaves";
    this.lobby = quickMatch({
      orders,
      onQueue: (n) => {
        $("searchText").textContent = n > 1 ? `${n} soldiers on the radio` : "Scanning the airwaves";
      },
      onMatched: (code) => {
        this.lobby = null;
        $("searchText").textContent = "Contact. Stand by";
        this.sfx.play("found");
        this.openRoom(code);
      },
      onFail: () => {
        this.toast("Lost the radio. Try again.");
        this.title.back();
      },
    });
  }

  async board() {
    const body = $("boardBody");
    body.innerHTML = '<tr><td colspan="5">Reading the roll</td></tr>';
    try {
      const { players } = await api("/api/leaderboard");
      this.network.roll(players);
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
