import * as THREE from "three";
import { OrdersForm, ordersLine } from "./orders.js";
import { randomOrders, cleanOrders } from "../shared/rules.js";
import { LEVELS } from "./ai.js";

// The title, lived in the trench network behind our left flank. Each place is framed by one of
// the director's shots; moving between places is one continuous camera journey along the
// trench; the things you can use are objects in the world, each with a real button laid over it
// (so Tab, screen readers and taps all work) and paper for anything that needs writing.
const $ = (id) => document.getElementById(id);
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Waypoints between places, clear of the walls. A route also runs backwards.
const ROUTES = {
  "corner>war": [[-13.6, 1.95, 12.2], [-13.6, 1.85, 15.4]],
  "corner>signals": [[-13.6, 1.95, 12.2], [-13.7, 1.85, 13.9], [-15.6, 1.72, 14.1]],
  "corner>radio": [[-12.6, 2.5, 13.2], [-10.2, 2.8, 16.4], [-9.7, 2.5, 20.2]],
  "corner>board": [[-13.4, 2.25, 10.8], [-14.2, 1.9, 8.9]],
  "corner>front": [[-13.3, 3.1, 5.6], [-7, 3.5, -3.5], [-1.8, 2.7, -8.2]],
  "war>front": [[-13.6, 1.85, 15.4], [-13.6, 2.3, 11], [-13.4, 3.1, 5.6], [-7, 3.5, -3.5], [-1.8, 2.7, -8.2]],
  "war>signals": [[-13.6, 1.85, 15.6], [-13.7, 1.85, 14.2], [-15.6, 1.72, 14.1]],
};
// Out of each place and over the top, into the battle.
const EXIT = {
  corner: [[-13.2, 3.2, 5.8]],
  front: [],
  signals: [[-15.6, 1.72, 14.1], [-13.7, 1.95, 13.4], [-13.6, 2.4, 10.5], [-13.2, 3.3, 5.8]],
  radio: [[-9.7, 2.5, 20.2], [-10.2, 2.9, 16.4], [-11.5, 3.2, 11.5], [-9, 3.6, 6.5]],
  war: [[-13.6, 1.85, 15.4], [-13.6, 2.4, 11], [-13.2, 3.3, 5.8]],
  board: [[-13.5, 1.9, 10.6], [-13.2, 3.2, 5.8]],
};
// From the battle views back to the trench corner.
const RETURN = [[-4, 3.6, 12], [-10, 2.9, 12.8]];
// The intro: high over no man's land, down through the smoke, over the enemy line, back across
// the field and over our parapet into the corner.
const INTRO = [[16, 16, -46], [9, 6, -30], [3, 2.6, -12], [-4, 2.4, -2], [-10, 3.2, 3], [-12.4, 3.1, 8.8]];

const PLACES = {
  corner: {
    shot: "corner",
    note: "The trench corner. Pick a way from the signpost.",
    hot: [
      { key: "solo", label: "Play the computer", plank: true },
      { key: "friend", label: "Play a friend", plank: true },
      { key: "quick", id: "quickBtn", label: "Quick match", plank: true },
      { key: "board", id: "boardBtn", label: "Roll of honour", plank: true },
      { key: "manual", label: "Field manual" },
      { key: "sound", label: "Sound", toggle: true },
      { key: "tag", label: "Your dog tag" },
    ],
  },
  war: { shot: "war", back: "corner", note: "The war room. Your orders are in the dossier.", hot: [{ key: "dossier", label: "Your orders" }] },
  front: {
    shot: "front",
    back: "war",
    note: "Their commanders. Pick your opponent.",
    hot: ["recruit", "sergeant", "general"].map((k) => ({ key: k, level: k, sign: true, tag: LEVELS[k].note, label: `${LEVELS[k].name}: ${LEVELS[k].note}` })),
  },
  signals: {
    shot: "signals",
    back: "corner",
    note: "The signals dugout. Open a room on the telephone, or dial a friend's.",
    hot: [{ key: "phone", id: "createBtn", label: "Open a room" }, { key: "chalkboard", label: "Dial a friend's code" }],
  },
  radio: { shot: "radio", back: "corner", note: "The radio post, searching the airwaves.", hot: [{ key: "clipboard", label: "Your orders" }] },
  board: { shot: "board", back: "corner", note: "The roll of honour.", hot: [] },
};

export class Title {
  constructor(app) {
    this.app = app;
    this.place = null;
    this.busy = false;
    this.v = new THREE.Vector3();
    this.hotEls = [];
    this.bind();
    app.stage.hooks.push(() => this.pin());
  }

  get dir() {
    return this.app.director;
  }

  get net() {
    return this.app.network;
  }

  bind() {
    $("backBtn").addEventListener("click", () => this.back());
    $("ordersGo").addEventListener("click", () => this.ordersGo());
    $("joinForm").addEventListener("submit", (e) => {
      e.preventDefault();
      this.dial($("joinCode").value.trim().toUpperCase());
    });
    $("joinCode").addEventListener("input", () => this.tiles());
    $("joinAccept").addEventListener("click", () => this.accept());
    $("joinDecline").addEventListener("click", () => this.hangUp());
    $("cancelWait").addEventListener("click", () => this.hangUp());
    $("shareBtn").addEventListener("click", () => this.app.share());
    addEventListener("keydown", (e) => {
      if (this.app.screen !== "menu" || document.querySelector("dialog[open]")) return;
      if (e.key === "Escape") {
        e.preventDefault();
        this.back();
      }
    });
    // Any click or key during the intro skips to its end; a click during a journey hurries it.
    addEventListener("pointerdown", () => {
      if (this.app.screen !== "menu") return;
      if (this.introing) this.skipIntro();
      else if (this.busy) this.dir.hurry();
    }, true);
    addEventListener("keydown", () => this.introing && this.skipIntro(), true);
  }

  // Arriving on the title: the corner, reached from wherever the camera is.
  async home({ first = false, intro = false } = {}) {
    this.clear();
    this.hosting = null;
    this.joining = null;
    this.net.chalk("");
    if (first && intro && !reduced()) return this.intro();
    if (first) {
      this.dir.applyShot("corner", true);
      return this.arrive("corner");
    }
    if (this.place === "corner") return this.arrive("corner");
    this.busy = true;
    await this.dir.travel("corner", this.place ? route(this.place, "corner") : RETURN);
    this.busy = false;
    if (this.app.screen === "menu") this.arrive("corner");
  }

  // A shared room link: to the signals dugout, where the host's orders come in to read.
  async link(code) {
    await this.go("signals");
    this.dial(code);
  }

  async intro() {
    this.clear();
    this.place = null;
    this.introing = true;
    this.dir.pos.set(22, 24, -60);
    this.dir.look.set(0, 2, -18);
    this.dir.fov = 46;
    this.dir.name = "intro";
    const flight = this.dir.travel("corner", INTRO, { dur: 9, ease: "power1.inOut" });
    await flight;
    if (!this.introing) return;
    this.introing = false;
    try {
      localStorage.setItem("di.intro", "1");
    } catch {}
    this.arrive("corner");
  }

  skipIntro() {
    if (!this.introing) return;
    this.introing = false;
    this.dir.journey?.progress(1);
    try {
      localStorage.setItem("di.intro", "1");
    } catch {}
    this.arrive("corner");
  }

  replayIntro() {
    this.app.home();
    this.introing = true;
    requestAnimationFrame(() => this.intro());
  }

  // Walks the camera to another place and lays out that place's objects once it settles.
  async go(to, opts = {}) {
    if (this.busy || to === this.place) return;
    const from = this.place;
    this.opts = opts;
    this.clear();
    this.busy = true;
    this.app.sfx.play("paperOff");
    await this.dir.travel(PLACES[to].shot, route(from, to));
    this.busy = false;
    if (this.app.screen !== "menu") return;
    this.arrive(to);
  }

  arrive(name) {
    this.place = name;
    const p = PLACES[name];
    document.body.dataset.place = name;
    $("backBtn").hidden = !p.back;
    $("placeNote").textContent = p.note;
    this.layHots(p.hot);
    this.onArrive(name);
    this.app.layout();
  }

  onArrive(name) {
    if (name === "war") this.showOrders();
    if (name === "signals") this.signalsState();
    if (name === "radio") this.app.quick();
    if (name === "board") this.roll();
    if (name === "corner") this.who();
    const first = this.hotEls[0]?.el;
    if (first && matchMedia("(pointer: fine)").matches) first.focus({ preventScroll: true });
  }

  back() {
    if (this.busy) return this.dir.hurry();
    const p = PLACES[this.place];
    if (!p?.back) return;
    if (this.place === "radio") this.app.cancelLobby();
    if (this.place === "signals" && this.hosting) this.hangUp();
    const to = this.place === "war" && this.opts?.mode === "host" ? "signals" : p.back;
    this.go(to, to === "war" ? { mode: "solo" } : {});
  }

  // Leaving the title for a match: out of the place and over the top to `shot`.
  exitTo(shot) {
    if (!this.place && !this.busy) return null;
    const from = this.place || "corner";
    this.clear();
    this.place = null;
    delete document.body.dataset.place;
    return this.dir.travel(shot, EXIT[from] || [], { dur: 2.6, ahead: false });
  }

  clear() {
    for (const h of this.hotEls) {
      h.el.remove();
      this.net.hover(h.key, false);
    }
    this.hotEls = [];
    for (const s of document.querySelectorAll("#menu .sheet")) s.hidden = true;
    $("backBtn").hidden = true;
    $("placeNote").textContent = "";
  }

  // The buttons over the objects: invisible over a plank (its words are painted on it), a
  // paper tag under anything else.
  layHots(list) {
    const host = $("hots");
    this.hotEls = list.map((h) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = `hot${h.plank || h.sign ? " sign" : ""}`;
      if (h.id) el.id = h.id;
      if (h.level) el.dataset.level = h.level;
      el.setAttribute("aria-label", h.label);
      el.innerHTML = h.plank ? "" : `<span class="hot-tag">${h.tag || h.label}</span>`;
      if (h.toggle) el.setAttribute("aria-pressed", String(this.app.sfx.enabled));
      el.addEventListener("click", () => this.use(h, el));
      el.addEventListener("pointerenter", () => this.net.hover(h.key, true));
      el.addEventListener("pointerleave", () => this.net.hover(h.key, false));
      el.addEventListener("focus", () => this.net.hover(h.key, true));
      el.addEventListener("blur", () => this.net.hover(h.key, false));
      host.append(el);
      return { ...h, el };
    });
    this.pin();
  }

  // Each frame, every button sits over its object.
  pin() {
    if (!this.hotEls.length) return;
    const cam = this.app.stage.camera;
    const anchors = this.net.anchors;
    for (const h of this.hotEls) {
      const a = anchors[h.key];
      if (!a) continue;
      const v = this.v.copy(a).project(cam);
      const off = v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1;
      h.el.style.visibility = off ? "hidden" : "";
      h.el.style.transform = `translate(${((v.x + 1) / 2) * innerWidth}px, ${((1 - v.y) / 2) * innerHeight}px)`;
    }
  }

  use(h, el) {
    if (this.busy) return;
    const app = this.app;
    app.sfx.play("knock");
    switch (h.key) {
      case "solo": return this.go("war", { mode: "solo" });
      case "friend": return this.go("signals");
      case "quick": return this.go("radio");
      case "board": return this.go("board");
      case "manual": return $("manualDlg").showModal();
      case "sound": {
        app.sfx.unlock();
        app.sfx.setEnabled(!app.sfx.enabled);
        el.setAttribute("aria-pressed", String(app.sfx.enabled));
        return app.sfx.play("click");
      }
      case "tag": {
        const s = $("tagSheet");
        s.hidden = !s.hidden;
        return this.app.layout();
      }
      case "dossier": return this.showOrders(true);
      case "recruit":
      case "sergeant":
      case "general": return app.solo(h.level);
      case "phone": return this.openRoom();
      case "chalkboard": return this.showDial();
      case "clipboard": return $("quickSheet").querySelector("input")?.focus();
    }
  }

  // ---- the war room: your orders -----------------------------------------------------------

  showOrders(focus = false) {
    const host = $("ordersForm");
    if (!this.ordersForm) {
      this.ordersForm = new OrdersForm(host, { orders: this.app.orders, title: "Standing orders", onChange: (o) => {
        this.app.setOrders(o);
        this.app.sfx.play("click");
      } });
    } else this.ordersForm.set(this.app.orders);
    $("ordersGo").textContent = this.opts?.mode === "host" ? "Open the room" : "To the front";
    $("ordersSheet").hidden = false;
    this.app.sfx.play("paper");
    this.app.layout();
    if (focus) host.querySelector("input")?.focus();
  }

  ordersGo() {
    if (this.opts?.mode === "host") return this.go("signals", { create: true });
    this.go("front");
  }

  // ---- the signals dugout: rooms -----------------------------------------------------------

  signalsState() {
    if (this.opts?.create) {
      this.opts = {};
      this.create();
    } else if (!this.hosting) this.net.chalk("");
  }

  async openRoom() {
    if (!(await this.app.needCallsign())) return;
    this.go("war", { mode: "host" });
  }

  async create() {
    const code = await this.app.create();
    if (!code) return;
    this.hosting = code;
    this.net.chalk(code);
    $("roomCode").textContent = code;
    $("waitSheet").hidden = false;
    this.app.sfx.play("ring");
    this.app.layout();
  }

  showDial() {
    $("joinCode").value = "";
    this.tiles();
    $("dialSheet").hidden = false;
    $("joinSheet").hidden = true;
    this.app.layout();
    $("joinCode").focus();
  }

  tiles() {
    const v = $("joinCode").value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
    if ($("joinCode").value !== v) $("joinCode").value = v;
    [...$("dialSheet").querySelectorAll(".dial-tiles i")].forEach((t, i) => {
      t.textContent = v[i] || "";
      t.classList.toggle("on", i === v.length);
    });
  }

  // Dialling a friend: the host's orders come back as a telegram to read before accepting.
  async dial(code) {
    const room = await this.app.peekRoom(code);
    if (!room) return;
    this.joining = code;
    $("joinTg").innerHTML = `<p class="tg-head"><span>Field telegraph</span><em>Room ${code}</em></p><div class="tg-lines"><p><span class="tg-strip">${room.host ? `${escape(room.host)} invites you` : "You are invited"} to the field stop</span></p><p><span class="tg-strip">Orders ${escape(ordersLine(room.orders || {}))} stop</span></p></div>`;
    $("dialSheet").hidden = true;
    $("joinSheet").hidden = false;
    this.app.sfx.play("morse");
    this.app.layout();
    $("joinAccept").focus();
  }

  accept() {
    if (!this.joining) return;
    const code = this.joining;
    this.joining = null;
    $("joinSheet").hidden = true;
    this.app.openRoom(code, false);
  }

  hangUp() {
    this.joining = null;
    if (this.hosting) {
      this.hosting = null;
      this.app.cancelRoom();
    }
    this.net.chalk("");
    for (const id of ["waitSheet", "joinSheet", "dialSheet"]) $(id).hidden = true;
    this.app.layout();
  }

  // ---- the radio post: quick match -----------------------------------------------------------

  quickOrders() {
    const host = $("quickForm");
    this.quick = cleanOrders(randomOrders());
    if (!this.quickForm) this.quickForm = new OrdersForm(host, { orders: this.quick, title: "Orders on the clipboard", onChange: (o) => {
      this.quick = o;
      this.app.lobby?.setOrders(o);
      this.app.sfx.play("click");
    } });
    else this.quickForm.set(this.quick);
    $("quickSheet").hidden = false;
    this.app.layout();
    return this.quick;
  }

  // ---- the notice board: the roll of honour ------------------------------------------------

  async roll() {
    $("rollSheet").hidden = false;
    this.app.layout();
    await this.app.board();
  }

  // ---- the corner: your dog tag -------------------------------------------------------------

  who() {
    this.app.renderWho();
  }
}

function route(from, to) {
  if (!from) return RETURN;
  const k = `${from}>${to}`;
  if (ROUTES[k]) return ROUTES[k];
  const r = ROUTES[`${to}>${from}`];
  if (r) return [...r].reverse();
  // Through the corner when two places are not joined directly.
  const a = ROUTES[`corner>${from}`] ? [...ROUTES[`corner>${from}`]].reverse() : [];
  const b = ROUTES[`corner>${to}`] || [];
  return [...a, [-13.2, 2.3, 11.4], ...b];
}

const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
