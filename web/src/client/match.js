import { gsap } from "gsap/gsap-core";
import { isCode, randomCode, anySupply, cleanOrders, STANDARD_ORDERS, POWERS } from "../shared/rules.js";
import { TIMES } from "../shared/game.js";
import { Desk } from "./desk.js";
import { OrdersForm, ordersLine } from "./orders.js";
import { telegramHtml, reportLines } from "./report.js";

export const TAUNTS = ["Salute", "Fire in the hole!", "Ha ha ha", "Good game", "Come on then", "Boom"];
const PHASE_MS = { supply: TIMES.supply, deploy: TIMES.deploy };
const mmss = (ms) => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};
const $ = (id) => document.getElementById(id);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
const SOLDIER = '<svg viewBox="0 0 14 16" aria-hidden="true"><circle cx="7" cy="3.6" r="3.1"/><path d="M1.5 16v-3.6a5.5 5.5 0 0 1 11 0V16z"/></svg>';
const pips = (n) => "<i></i>".repeat(Math.max(0, n));
const store = (k, v) => {
  try {
    if (v === undefined) return localStorage.getItem(k);
    localStorage.setItem(k, v);
  } catch {}
  return null;
};
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const KEYS = { a: "aim", r: "recon", s: "sniper", m: "smoke", l: "log", t: "chat" };
// One-shot effects run through the Web Animations API and cancel the previous run, so a
// replay never stacks on a finished one.
function play(el, frames, opts) {
  el.__anim?.cancel();
  el.__anim = el.animate(frames, { fill: "forwards", ...opts, duration: reduced() ? 1 : opts.duration, delay: reduced() ? 0 : opts.delay || 0 });
  return el.__anim;
}

export class MatchView {
  constructor(app) {
    this.app = app;
    this.el = {};
    for (const id of ["note", "turn", "turnLabel", "timer", "meName", "oppName", "meCrates", "oppCrates", "oppDot", "slots", "pad", "fireBtn", "delBtn",
      "mineLog", "theirLog", "logCount", "logs", "logSeg", "rematchBtn", "homeBtn", "rematchLabel", "rematchSub", "verdict",
      "telegram", "tgBody", "tgStatus", "tgOrders", "tgOrdersLine", "tgAmend", "tgForm", "ends", "over",
      "rps", "stamp", "myCode", "taunts", "markBtn", "randomBtn", "recent", "bar", "tbSupplies", "tbCrates", "crateCount", "unread",
      "scope", "scopeTag", "say", "reticle", "reticleTag", "live", "clock"]) this.el[id] = $(id);
    this.windows = Object.fromEntries(["recon", "sniper", "smoke"].map((k) => [k, $(`w-${k}`)]));
    this.slotEls = [...this.el.slots.children];
    this.keys = new Map([...this.el.pad.querySelectorAll("[data-d]")].map((b) => [b.dataset.d, b]));
    this.active = false;
    this.marks = new Map();
    this.sel = { recon: {}, sniper: {} };
    this.unreadN = 0;
    this.seenVolleys = 0;
    this.idleAt = 0;
    this.v3 = this.app.stage.camera.position.clone();
    const extra = this.el.say.cloneNode();
    extra.removeAttribute("id");
    document.body.append(extra);
    this.bubbles = [this.el.say, extra].map((el) => ({ el, soldier: null, off: 0 }));
    this.desk = new Desk({
      onOpen: (name) => this.opened(name),
      onClose: (name) => this.closed(name),
      onChange: () => {
        this.updateReticle();
        this.refreshBar();
      },
      sound: (how) => this.sfx.play(how === "open" ? "paper" : how === "min" ? "paperOff" : "knock"),
    });
    this.bind();
    this.logView(store("di.log") || "mine");
    this.dir.on("scope", (o) => this.scope(o));
    this.dir.on("say", ({ soldier, text, ms }) => this.say(soldier, text, ms, "opp"));
    this.dir.on("verdict", (v) => this.active && this.verdict(v));
    this.app.stage.hooks.push(() => this.pin());
    gsap.ticker.add(() => this.clock());
  }

  get sfx() {
    return this.app.sfx;
  }

  get dir() {
    return this.app.director;
  }

  bind() {
    const e = this.el;
    for (const [d, b] of this.keys) {
      let timer = null;
      let held = false;
      b.addEventListener("pointerdown", () => {
        held = false;
        clearTimeout(timer);
        timer = setTimeout(() => {
          held = true;
          this.cycleMark(d);
          navigator.vibrate?.(12);
        }, 480);
      });
      const cancel = () => clearTimeout(timer);
      b.addEventListener("pointerup", cancel);
      b.addEventListener("pointerleave", cancel);
      b.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        if (!held) this.cycleMark(d);
        held = true;
      });
      b.addEventListener("click", () => {
        if (held) {
          held = false;
          return;
        }
        this.press(d);
      });
    }
    e.delBtn.addEventListener("click", () => this.back());
    e.fireBtn.addEventListener("click", () => this.fire());
    for (const b of e.rps.querySelectorAll("[data-pick]")) b.addEventListener("click", () => this.pick(b.dataset.pick));
    e.markBtn.addEventListener("click", () => {
      this.markMode = !this.markMode;
      e.markBtn.setAttribute("aria-pressed", String(this.markMode));
      e.pad.classList.toggle("marking", this.markMode);
      this.sfx.play("click");
      if (this.markMode) this.app.toast("Tap digits to mark them out, then in");
    });
    e.randomBtn.addEventListener("click", () => {
      if (this.s?.phase !== "deploy" || this.s.me.secret) return;
      this.input = randomCode();
      this.sfx.play("clack", { n: 2 });
      this.renderSlots(true);
      this.dir.setCode(this.input);
      this.refresh();
    });
    e.taunts.innerHTML = TAUNTS.map((t, i) => `<button type="button" data-taunt="${i}">${t}</button>`).join("");
    for (const b of e.taunts.querySelectorAll("[data-taunt]")) {
      b.addEventListener("click", () => {
        const id = Number(b.dataset.taunt);
        this.conn?.send({ t: "taunt", id });
        this.showTaunt(id, "mine");
        this.desk.minimise("chat");
      });
    }
    for (const b of e.logSeg.querySelectorAll("[data-log]")) {
      b.addEventListener("click", () => {
        this.logView(b.dataset.log);
        this.sfx.play("click");
      });
    }
    e.recent.addEventListener("click", () => this.desk.open("log", { byUser: true }));
    for (const host of document.querySelectorAll(".pick.digits")) this.picker(host, [..."1234567890"], "digit", (v) => v);
    for (const host of document.querySelectorAll(".pick.spots")) this.picker(host, [0, 1, 2, 3], "pos", (v) => `${SOLDIER}<span>${v + 1}</span>`, (v) => `Soldier in spot ${v + 1}`);
    for (const b of document.querySelectorAll("[data-go]")) b.addEventListener("click", () => this.usePower(b.dataset.go));
    for (const w of Object.values(this.windows)) {
      const brief = w.querySelector("[data-brief]");
      brief.textContent = brief.dataset.brief;
    }
    this.fieldAim();
    this.tips();
    e.rematchBtn.addEventListener("click", () => this.call());
    e.homeBtn.addEventListener("click", () => {
      this.sfx.play("knock");
      this.app.home();
    });
    e.tgAmend.addEventListener("click", () => this.amend());
    e.over.addEventListener("scroll", () => this.scrollCue(), { passive: true });
    new ResizeObserver(() => this.scrollCue()).observe(e.telegram);
    addEventListener("keydown", (ev) => {
      if (!this.active || document.querySelector("dialog[open]") || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
      const phase = this.ended ? "over" : this.s?.phase;
      const onBar = phase === "deploy" || phase === "battle";
      if (k === "Escape") {
        if (!onBar || !this.desk.escape()) this.app.pause();
      } else if (phase === "supply" && "rps".includes(k) && k.length === 1) this.pick({ r: "rock", p: "paper", s: "scissors" }[k]);
      else if (k === "p") this.app.pause();
      else if (!onBar) return;
      else if (/^[0-9]$/.test(k)) {
        if (!this.desk.isOpen("aim")) this.desk.open("aim");
        this.press(k);
      } else if (k === "Backspace") this.back();
      else if (k === "Enter" && (ev.target === document.body || ev.target.closest?.("#w-aim"))) this.fire();
      else if (KEYS[k]) {
        const b = document.querySelector(`#bar [data-open="${KEYS[k]}"]`);
        if (!b || b.disabled || b.offsetParent === null) return;
        this.desk.toggle(KEYS[k], true);
      } else return;
      ev.preventDefault();
    });
  }

  // Labels for the icons: a paper tag on hover, or on a long press on a phone.
  tips() {
    for (const b of document.querySelectorAll("#bar .tb:not(.end)")) {
      const tip = document.createElement("span");
      tip.className = "tip";
      tip.setAttribute("aria-hidden", "true");
      tip.innerHTML = `${b.getAttribute("aria-label")}${b.dataset.key && !b.classList.contains("hand") ? ` <kbd>${b.dataset.key}</kbd>` : ""}`;
      b.append(tip);
      let t = null;
      b.addEventListener("pointerdown", (ev) => {
        if (ev.pointerType !== "touch") return;
        clearTimeout(t);
        t = setTimeout(() => {
          b.classList.add("tipped");
          b.dataset.held = "1";
          navigator.vibrate?.(10);
          setTimeout(() => b.classList.remove("tipped"), 1400);
        }, 450);
      });
      for (const ev of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(ev, () => clearTimeout(t));
      b.addEventListener("click", (ev) => {
        if (b.dataset.held) {
          delete b.dataset.held;
          ev.stopImmediatePropagation();
          ev.preventDefault();
        }
      }, true);
      b.addEventListener("contextmenu", (ev) => ev.preventDefault());
    }
  }

  // The sniper's soldier can be picked on the field itself: tap one of theirs while the Sniper
  // window is open.
  fieldAim() {
    const canvas = this.app.stage.renderer.domElement;
    const near = (x, y) => {
      if (!this.desk.isOpen("sniper") || !this.canPower("sniper")) return null;
      const cam = this.app.stage.camera;
      let best = null;
      let bestD = Math.max(48, innerWidth * 0.05);
      this.app.army.squad("opp").forEach((sd, i) => {
        sd.above(this.v3, -0.35).project(cam);
        const px = (this.v3.x * 0.5 + 0.5) * innerWidth;
        const py = (-this.v3.y * 0.5 + 0.5) * innerHeight;
        const d = Math.hypot(px - x, py - y);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      return best;
    };
    canvas.addEventListener("pointermove", (ev) => {
      if (ev.pointerType !== "mouse") return;
      canvas.style.cursor = near(ev.clientX, ev.clientY) != null ? "crosshair" : "";
    });
    canvas.addEventListener("click", (ev) => {
      const i = near(ev.clientX, ev.clientY);
      if (i == null) return;
      const host = this.windows.sniper.querySelector(".pick.spots");
      const b = host.querySelector(`[data-v="${i}"]`);
      if (b.getAttribute("aria-pressed") !== "true") b.click();
    });
  }

  start(conn, { solo = false, level = null } = {}) {
    this.stop();
    this.conn = conn;
    this.solo = solo;
    this.level = level;
    this.active = true;
    this.s = null;
    this.q = Promise.resolve();
    this.input = "";
    this.markMode = false;
    this.el.markBtn.setAttribute("aria-pressed", "false");
    this.el.pad.classList.remove("marking");
    this.marks.clear();
    this.renderMarks();
    this.animating = 0;
    this.offset = 0;
    this.oppOnline = true;
    this.oppSeen = false;
    this.lastTick = -1;
    this.clearPicks();
    this.el.mineLog.innerHTML = "";
    this.el.theirLog.innerHTML = "";
    this.el.recent.hidden = true;
    this.unreadN = 0;
    this.seenVolleys = 0;
    this.setPhaseClass(null);
    this.renderSlots();
    this.desk.reset({ restore: false });
  }

  stop() {
    this.run = (this.run || 0) + 1;
    this.active = false;
    this.conn?.close();
    this.conn = null;
    this.setPhaseClass(null);
    this.cine(false);
    this.scope({ on: false });
    for (const b of this.bubbles) this.unsay(b);
    clearTimeout(this.aimOff);
    this.clearEnd();
  }

  enqueue(fn) {
    const run = this.run;
    this.q = this.q.then(() => (this.active && this.run === run ? fn() : null)).catch((e) => console.error(e));
  }

  // The match has ended here, even while its final state is still on its way.
  get ended() {
    return !!this.result || this.s?.phase === "over";
  }

  // ---- incoming -----------------------------------------------------------------------------

  message(m) {
    if (!this.active) return;
    switch (m.t) {
      case "state":
        this.offset = m.now - Date.now();
        this.enqueue(() => this.apply(m));
        break;
      case "rps": this.enqueue(() => this.playRps(m)); break;
      case "volley": this.enqueue(() => this.playVolley(m)); break;
      case "power": this.enqueue(() => this.playPower(m)); break;
      case "over": this.enqueue(() => this.playOver(m)); break;
      case "laststand": this.enqueue(() => this.playLastStand(m)); break;
      case "timeup": this.enqueue(() => this.playTimeUp(m)); break;
      case "restart": this.enqueue(() => this.restart()); break;
      case "assigned": this.enqueue(() => this.app.toast(`Out of time: HQ assigned your code, ${m.code}`)); break;
      case "picked": this.sfx.play("click"); this.note(`<b>${this.oppName}</b> has picked`); break;
      case "joined": if (!this.solo) this.app.toast(`${m.name} joined the room`); break;
      case "ready": this.sfx.play("lock", { far: 0.8 }); this.app.toast(`${this.oppName} has deployed their code`); break;
      case "rematch":
        if (this.s?.rematch?.me) {
          this.announce(`${this.oppName} answered. Rematch.`);
          break;
        }
        this.oppCalled = true;
        this.announce(`${this.oppName} is calling for a rematch.`);
        this.renderEnd();
        break;
      case "taunt": this.showTaunt(m.id, "opp"); break;
      case "aim": this.oppAim(m.n); break;
      case "presence":
        this.presence(m.opp);
        this.renderEnd();
        break;
      case "error":
        this.sfx.play("error");
        this.app.toast(m.msg);
        this.firing = false;
        this.powerSent = false;
        this.refresh();
        break;
    }
  }

  get oppName() {
    return this.s?.opp?.name || "The enemy";
  }

  setPhaseClass(phase) {
    const b = document.body;
    for (const c of [...b.classList]) if (c.startsWith("phase-")) b.classList.remove(c);
    if (phase) b.classList.add(`phase-${phase}`);
    this.app.layout();
  }

  async apply(s) {
    const prev = this.s;
    this.s = s;
    const fresh = !prev || prev.match !== s.match;
    const moved = fresh || prev.phase !== s.phase;
    if (moved) {
      this.firing = false;
      this.powerSent = false;
      this.setPhaseClass(s.phase);
      const entered = this.enterPhase(s.phase, fresh ? null : prev);
      this.update(s, prev);
      await entered;
    }
    this.update(s, prev);
  }

  update(s, prev) {
    const e = this.el;
    const show = s.me.secret && (s.phase === "battle" || s.phase === "over");
    const code = show ? s.me.secret.split("").map((c) => `<i>${c}</i>`).join("") : "";
    if (e.myCode.innerHTML !== code) e.myCode.innerHTML = code;
    e.meName.textContent = s.me.name;
    e.oppName.textContent = s.opp?.name || "Waiting";
    const armed = s.phase === "battle" || s.phase === "over";
    const crates = (el, n) => {
      const html = armed ? pips(n) : "";
      if (el.innerHTML !== html) el.innerHTML = html;
      el.title = armed ? plural(n, "crate") : "";
    };
    crates(e.meCrates, s.me.supplies);
    crates(e.oppCrates, s.opp?.supplies || 0);
    if (s.phase === "battle" && prev && prev.phase === "battle" && prev.turn !== s.turn && !this.turnSeen?.has(`${s.match}:${s.volleys.length}`)) {
      (this.turnSeen ||= new Set()).add(`${s.match}:${s.volleys.length}`);
      if (s.turn === "me") {
        this.sfx.play("bugle");
        this.announce("Your shot.");
        this.idleAt = performance.now();
        this.banner(s.lastStand ? "Last stand" : "Your shot");
      } else {
        this.sfx.play("radio");
        this.banner(s.lastStand ? "Their last stand" : "Their shot");
      }
      this.firing = false;
      this.powerSent = false;
    }
    this.dir.smoke("me", !!s.me.smoke);
    this.dir.smoke("opp", !!s.opp?.smoke);
    const tension = s.lastStand || s.volleys.some((v) => (v.dead || 0) >= 3);
    if (s.phase === "battle") this.sfx.mood(tension ? "tension" : "battle");
    else if (s.phase === "supply" || s.phase === "deploy") this.sfx.mood("battle");
    this.renderLogs();
    if (s.phase === "over" && s.result) this.fillOver(s.result);
    this.renderEnd();
    if (s.phase === "over" && this.pendingTell) {
      this.pendingTell = false;
      this.tell();
    }
    this.refresh();
  }

  async enterPhase(phase, prev) {
    const s = this.s;
    this.app.onPhase(phase);
    if (phase === "lobby") return;
    this.dir.titleShow(false);
    if (phase === "supply") {
      if (!prev || prev.phase === "lobby") this.sfx.play("found");
      this.dir.resetField();
      this.dir.rpsShow(true);
      this.input = "";
      this.renderSlots();
      for (const b of this.el.rps.querySelectorAll("button")) b.classList.remove("picked");
      await (this.app.title.exitTo("supply") || this.dir.shot("supply", prev ? 1.2 : 0.01));
      this.banner("Supply draw");
      this.note(this.drawNote(s));
    } else if (phase === "deploy") {
      this.dir.rpsShow(false);
      this.input = s.me.secret || "";
      this.renderSlots();
      this.dir.setCode(this.input, { sound: false });
      this.dir.crate(true);
      this.desk.reset({ restore: false });
      this.desk.open("aim");
      await this.dir.shot("deploy", prev ? 1.3 : 0.01);
      this.banner("Deploy");
      this.note(`<b>Hide your code:</b> four different digits. ${this.oppName} never sees it.`);
    } else if (phase === "battle") {
      this.dir.rpsShow(false);
      this.dir.setCode(s.me.secret, { sound: false });
      this.input = "";
      this.renderSlots();
      this.dir.crate(false);
      this.desk.reset();
      if (s.turn === "me" && !this.desk.isOpen("aim")) this.desk.open("aim");
      await this.dir.shot("home", prev ? 1.3 : 0.01);
      if (prev) {
        this.stamp("Battle", "stations", true);
        this.sfx.play(s.turn === "me" ? "bugle" : "radio");
      }
      this.idleAt = performance.now();
      this.banner(s.turn === "me" ? "Your shot" : "Their shot", 3200);
      this.note(s.turn === "me" ? "<b>You fire first.</b> Four digits on the keypad, then Fire." : `<b>${this.oppName} fires first.</b> Line up your reply.`);
    } else if (phase === "over") {
      this.desk.reset({ restore: false });
      this.el.turn.classList.remove("show");
      // A dropped connection can miss the "over" event: the ending then plays from the state.
      if (prev && !this.result && s.result) await this.playOver(s.result);
    }
    // Arriving at a match that has already ended: the verdict and the telegram are simply there.
    if (phase === "over" && !prev) {
      this.dir.setCode(s.me.secret || "", { sound: false });
      this.dir.shot("far", 0.01);
      const text = verdictWord(s.result);
      if (text) this.verdict({ text, winner: s.result.winner, reason: s.result.reason, instant: true });
      this.tell(true);
    }
  }

  // What the draw is for: crates and the first shot, or with no supplies just the first shot. In a
  // quick match it also decides whose orders stand.
  drawNote(s) {
    const o = s.orders || (s.offers ? null : STANDARD_ORDERS);
    if (!o) return "<b>Rock, paper or scissors.</b> The winner's orders stand.";
    if (!anySupply(o)) return "<b>Rock, paper or scissors.</b> No supplies in this match: the winner fires first.";
    const n = o.crates;
    return `<b>Rock, paper or scissors.</b> The winner takes ${plural(n, "crate")}, the loser ${n - 1} and the first shot.`;
  }

  note(html, ms = 4800) {
    const n = this.el.note;
    n.innerHTML = html || "";
    n.classList.toggle("on", !!html);
    clearTimeout(this.noteOff);
    if (html) this.noteOff = setTimeout(() => n.classList.remove("on"), ms);
  }

  banner(text, ms = 2600) {
    const t = this.el.turn;
    if (text) this.el.turnLabel.textContent = text;
    t.classList.add("show");
    t.classList.remove("nudge");
    clearTimeout(this.bannerOff);
    this.bannerOff = setTimeout(() => t.classList.remove("show", "nudge"), ms);
  }

  announce(text) {
    this.el.live.textContent = "";
    setTimeout(() => (this.el.live.textContent = text), 30);
  }

  // ---- the moments ------------------------------------------------------------------------

  async playRps(m) {
    this.animating++;
    this.refresh();
    this.note("");
    const words = ["Rock", "Paper", "Scissors", "Shoot"];
    this.dir.on("rpsBeat", (i) => this.stamp(words[i], "", true, true));
    await this.dir.rpsClash(m);
    this.dir.on("rpsBeat", null);
    if (m.result === "draw") {
      this.stamp("Draw", "throw again", true);
      this.note("<b>A draw.</b> Throw again.");
      for (const b of this.el.rps.querySelectorAll("button")) b.classList.remove("picked");
    } else {
      const won = m.result === "win";
      const stood = m.stand === "me" ? "Your orders stand. " : m.stand === "opp" ? `${this.oppName}'s orders stand. ` : "";
      const armed = anySupply(m.orders);
      const mine = m.supplies?.me ?? 0;
      const theirs = m.supplies?.opp ?? 0;
      if (won) this.sfx.play("yes");
      if (!armed) {
        this.stamp(won ? "First shot" : "Second shot", won ? "won the draw" : "lost the draw", true);
        this.note(`${stood}No supplies in this match. ${won ? "<b>You fire first.</b>" : `${this.oppName} fires first.`}`);
      } else if (won) {
        this.stamp(plural(mine, "crate"), "won the draw", true);
        this.note(`${stood}You take <b>${plural(mine, "crate")}</b>. ${this.oppName} gets ${theirs} and fires first.`);
      } else {
        this.stamp(plural(mine, "crate"), "and the first shot", true);
        this.note(`${stood}${this.oppName} takes ${plural(theirs, "crate")}. You get <b>${mine} and the first shot</b>.`);
      }
    }
    await wait(1.2);
    this.animating--;
    this.refresh();
  }

  async playVolley(v) {
    this.animating++;
    this.volleyBy = v.by;
    this.refresh();
    this.note("");
    if (v.by === "me") {
      for (const [i, el] of this.slotEls.entries()) {
        play(el, [{ transform: "none", opacity: 1 }, { transform: "translateY(-160px) scale(0.6)", opacity: 0 }], { duration: 550, delay: i * 40, easing: "cubic-bezier(0.65, 0, 0.35, 1)" });
      }
      await wait(0.7);
      this.input = "";
      this.renderSlots();
      for (const el of this.slotEls) el.__anim?.cancel();
    }
    this.dir.on("result", (r) => this.stampVolley(r));
    this.dir.on("hurt", (k) => this.hurt(k));
    await this.dir.volley(v);
    this.dir.on("result", null);
    this.volleyBy = null;
    this.animating--;
    this.firing = false;
    this.refresh();
  }

  stampVolley(v) {
    this.sfx.play("stamp");
    const who = v.by === "me" ? "Your volley" : `${this.oppName}'s volley`;
    if (v.miss) {
      this.stamp("Misfire", v.by === "me" ? "out of time" : "they ran out of time", true);
      return this.announce(`${who}: misfire.`);
    }
    if (v.hits != null) {
      this.stamp(plural(v.hits, "hit"), "lost in the smoke", true);
      return this.announce(`${who} ${v.guess.split("").join(" ")}: ${plural(v.hits, "hit")} in the smoke.`);
    }
    if (v.dead === 4) this.stamp("4 dead", v.by === "me" ? "code cracked" : "your code is cracked");
    else if (!v.dead && !v.injured) this.stamp("Missed", v.by === "me" ? "nothing hit" : "they hit nothing", true);
    else this.stamp(`${v.dead} dead`, `${v.injured} injured`);
    if (v.dead || v.injured) this.stampLogos(v.dead > 0, v.injured > 0, v.dead === 4);
    this.announce(`${who} ${v.guess.split("").join(" ")}: ${v.dead} dead, ${v.injured} injured.`);
  }

  async playPower(p) {
    this.animating++;
    this.refresh();
    if (p.by === "me") {
      if (p.kind === "recon") {
        this.cine(true);
        await this.dir.recon({ by: "me", found: p.result });
        this.cine(false);
        this.sfx.play(p.result ? "yes" : "no");
        this.stamp(`${p.args.digit} ${p.result ? "is in" : "is out"}`, "recon report", true);
        this.setMark(p.args.digit, p.result ? "in" : "out");
      } else if (p.kind === "sniper") {
        this.cine(true);
        await this.dir.sniper({ by: "me", spot: p.args.pos, hit: p.result });
        this.cine(false);
        this.sfx.play(p.result ? "yes" : "no");
        this.stamp(p.result ? "Dead on" : "Clean miss", `${p.args.digit} ${p.result ? "is" : "is not"} in spot ${p.args.pos + 1}`, true);
        if (p.result) this.setMark(p.args.digit, "in");
      } else {
        this.sfx.play("smoke");
        this.dir.smoke("me", true);
        this.stamp("Smoke up", "their next volley is blind", true);
      }
      await wait(1.1);
    } else {
      const text = { recon: "sent a spotter plane over your line", sniper: "has a sniper on you", smoke: "popped smoke" }[p.kind];
      this.app.toast(`${this.oppName} ${text}`);
      if (p.kind === "smoke") {
        this.sfx.play("smoke", { far: 0.6 });
        this.dir.smoke("opp", true);
        await wait(1);
      } else if (p.kind === "recon") await this.dir.recon({ by: "opp" });
      else await this.dir.sniper({ by: "opp" });
    }
    this.powerSent = false;
    this.animating--;
    this.refresh();
  }

  async playLastStand(m) {
    this.stamp("Last stand", m.by === "me" ? "they get one shot back" : "one shot to draw level");
    this.sfx.play("siren");
    this.sfx.mood("tension");
    this.note(m.by === "me" ? `You cracked it first. <b>${this.oppName}</b> gets one last shot to draw level.` : "<b>Your code is cracked.</b> One last shot to draw level.");
    await wait(2.2);
  }

  async playTimeUp(m) {
    this.stamp("Time", m.by === "me" ? "your shot closes the round" : "their shot closes the round");
    this.sfx.play("siren");
    this.note(m.by === "me" ? "<b>Time is up.</b> Your shot closes the round, then the closest to cracking wins." : `<b>Time is up.</b> ${this.oppName}'s shot closes the round, then the closest to cracking wins.`, 5200);
    await wait(1.8);
  }

  async playOver(r) {
    const run = this.run;
    this.result = r;
    if (this.solo && ["me", "opp", "draw"].includes(r.winner)) this.app.recordSolo({ me: "win", opp: "loss", draw: "draw" }[r.winner]);
    // The match state follows this event, so the battle's interface is cleared away now.
    this.setPhaseClass("over");
    this.desk.reset({ restore: false });
    this.animating++;
    this.refresh();
    this.sfx.mood("calm");
    this.note("");
    const cue = r.winner === "me" ? "fanfare" : r.winner === "opp" ? "taps" : r.winner === "draw" ? "horn" : null;
    if (cue) wait(0.6).then(() => this.run === run && this.sfx.play(cue));
    await this.dir.ending(r);
    if (this.run !== run) return;
    this.app.refreshMe();
    await wait(this.stamped ? 0.9 : 0.2);
    if (this.run !== run) return;
    this.animating--;
    // The telegram carries the final count, which comes with the match state after this event.
    this.pendingTell = true;
    if (this.s?.phase === "over") {
      this.pendingTell = false;
      this.tell();
    }
  }

  fillOver(r) {
    const key = `${this.s?.match}:${r.reason}:${r.winner}`;
    if (this.told === key) return;
    this.told = key;
    this.el.tgBody.innerHTML = telegramHtml(r, this.s, this.oppName, { number: telegramNo(this.s) });
  }

  // The rubber stamp that lands across the sky once the ending has played.
  verdict({ text, winner, reason, instant = false }) {
    const vd = this.el.verdict;
    if (!text) return;
    this.stamped = true;
    vd.querySelector("b").textContent = text;
    vd.querySelector("span").textContent = verdictLine(text, winner, reason);
    vd.classList.add("on");
    const ink = vd.firstElementChild;
    if (instant) return play(ink, [{ opacity: 1 }, { opacity: 1 }], { duration: 1 });
    play(ink, [
      { opacity: 0, transform: "scale(2.3) rotate(-15deg)", filter: "blur(3px)", easing: "cubic-bezier(0.55, 0, 1, 0.45)" },
      { opacity: 1, transform: "scale(0.93) rotate(-7deg)", filter: "blur(1.3px)", offset: 0.42, easing: OUT },
      { opacity: 1, transform: "scale(1.035) rotate(-7.4deg)", filter: "blur(0.6px)", offset: 0.62 },
      { opacity: 1, transform: "scale(0.99) rotate(-7deg)", filter: "blur(0.4px)", offset: 0.82 },
      { opacity: 1, transform: "scale(1) rotate(-7deg)", filter: "blur(0.3px)" },
    ], { duration: 680 });
    wait(reduced() ? 0 : 0.28).then(() => {
      this.sfx.play("stamp");
      this.dir.shake(0.3);
    });
    const r = this.s?.result || this.result;
    const head = r ? reportLines(r, this.s, this.oppName)[0] : "";
    this.announce(head.toUpperCase().startsWith(text) ? `${head}.` : `${text}. ${head}.`);
  }

  // The telegram comes in, and the telephone and the signpost go up on the plank.
  tell(instant = false) {
    const b = document.body;
    if (!this.active || b.classList.contains("told")) return;
    const r = this.s?.result || this.result;
    if (r) this.fillOver(r);
    b.classList.add("told");
    this.renderEnd();
    this.app.layout();
    const e = this.el;
    const phone = innerWidth < 900;
    if (!instant) {
      play(e.telegram, [
        { opacity: 0, transform: phone ? "translateY(70px) rotate(2deg)" : "translateX(60px) rotate(3deg)" },
        { opacity: 1, transform: "none" },
      ], { duration: 650, easing: OUT }).finished.then(() => this.scrollCue(), () => {});
      play(e.ends, [{ transform: "translateY(110%)" }, { transform: "none" }], { duration: 520, easing: OUT });
      const strips = e.tgBody.querySelectorAll(".tg-lines p, .tg-codes");
      strips.forEach((el, i) => play(el, [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)" }], { duration: 420, delay: 380 + i * 280, easing: "steps(14)", fill: "both" }));
      this.sfx.play("paper");
      this.sfx.play("morse", { delay: 0.38 });
    }
    if (!this.stamped && r) this.announce(`${reportLines(r, this.s, this.oppName)[0]}.`);
    this.scrollCue();
    const first = e.rematchBtn.hidden ? e.homeBtn : e.rematchBtn;
    first.focus({ preventScroll: true });
  }

  // A soft fade at the bottom of the telegram while more of it is below.
  scrollCue() {
    const o = this.el.over;
    o.classList.toggle("more", o.scrollHeight - o.clientHeight - o.scrollTop > 4);
  }

  // The telephone's state: ready to call, ringing at their end, or ringing here.
  renderEnd() {
    const s = this.s;
    const e = this.el;
    const r = s?.result || this.result;
    if (!s || !r) return this.ringing(false);
    const opp = this.oppName;
    const canCall = this.solo || ["cracked", "timeout", "time"].includes(r.reason);
    const online = this.solo || (this.oppOnline !== false && !this.lineCut);
    const mine = !!s.rematch?.me;
    const theirs = !this.solo && (!!s.rematch?.opp || !!this.oppCalled);
    e.rematchBtn.hidden = !canCall;
    let label = "Call for reinforcements";
    let sub = this.solo ? "play again" : "ask for a rematch";
    if (!online) {
      label = "The line is dead";
      sub = this.lineCut ? "the room has closed" : `${opp} went off the radio`;
    } else if (mine) {
      label = `Ringing ${opp}`;
      sub = "waiting for an answer";
    } else if (theirs) {
      label = "Answer the telephone";
      sub = `${opp} wants a rematch`;
    }
    e.rematchLabel.textContent = label;
    e.rematchSub.textContent = sub;
    e.rematchBtn.setAttribute("aria-disabled", String(!online || mine));
    e.rematchBtn.setAttribute("aria-label", `${label}: ${sub}`);
    this.app.icons.setState("phone", online ? "on" : "grey");
    this.ringing(canCall && online && (mine || theirs) && document.body.classList.contains("told"), theirs && !mine);
    let status = "";
    if (!canCall && r.winner !== "none") status = r.reason === "left" ? `No rematch: ${r.winner === "me" ? `${opp} left the field` : "you left the field"}.` : "";
    else if (canCall && this.lineCut) status = "The room has closed. No rematch from here.";
    else if (canCall && !online) status = `${opp} has gone off the line. No rematch unless they come back.`;
    if (e.tgStatus.textContent !== status) e.tgStatus.textContent = status;
    // A quick match rematch is a new draw: your own orders go into it, and you can amend them first.
    const offers = !this.solo && canCall && !!s.offers;
    e.tgOrders.hidden = !offers || !online;
    if (offers) {
      this.offer ||= cleanOrders(s.offers.me);
      e.tgOrdersLine.textContent = `${ordersLine(this.offer)}${mine ? " Sent with your call." : ""}`;
      e.tgAmend.hidden = mine;
      if (mine && !e.tgForm.hidden) this.amend(false);
    }
  }

  amend(open = this.el.tgForm.hidden) {
    const e = this.el;
    if (open && !this.ordersForm) {
      this.ordersForm = new OrdersForm(e.tgForm, {
        orders: this.offer,
        title: "Orders for the rematch",
        onChange: (o) => {
          this.offer = o;
          e.tgOrdersLine.textContent = ordersLine(o);
          this.sfx.play("click");
        },
      });
    } else if (open) this.ordersForm.set(this.offer);
    e.tgForm.hidden = !open;
    e.tgAmend.setAttribute("aria-expanded", String(open));
    e.tgAmend.textContent = open ? "Done" : "Amend";
    this.sfx.play(open ? "paper" : "paperOff");
    this.app.layout();
    requestAnimationFrame(() => {
      if (open) e.tgOrders.scrollIntoView({ block: "nearest", behavior: reduced() ? "auto" : "smooth" });
      this.scrollCue();
    });
  }

  // The room has gone (it closes a while after the match): the telephone goes dead.
  lineDown() {
    this.lineCut = true;
    this.renderEnd();
  }

  call() {
    const s = this.s;
    if (!this.ended || this.el.rematchBtn.getAttribute("aria-disabled") === "true") return;
    this.sfx.play("crank");
    if (this.solo) return this.app.solo(this.level);
    this.conn?.send(s.offers ? { t: "rematch", orders: this.offer } : { t: "rematch" });
    this.s = { ...s, rematch: { ...s.rematch, me: true } };
    this.renderEnd();
  }

  ringing(on, loud = false) {
    this.app.icons.setRing("phone", on);
    if (!on) {
      clearInterval(this.ringTimer);
      this.ringTimer = null;
      return;
    }
    if (this.ringTimer) return;
    const ring = () => this.sfx.play("ring", loud ? {} : { far: 0.7, gain: 0.5 });
    ring();
    this.ringTimer = setInterval(ring, 2400);
  }

  clearEnd() {
    document.body.classList.remove("told");
    this.el.verdict.classList.remove("on");
    this.el.verdict.firstElementChild.__anim?.cancel();
    this.ringing(false);
    this.told = null;
    this.result = null;
    this.pendingTell = false;
    this.stamped = false;
    this.oppCalled = false;
    this.lineCut = false;
    this.offer = null;
    if (this.ordersForm && !this.el.tgForm.hidden) this.amend(false);
  }

  async restart() {
    this.clearEnd();
    this.markRead();
    this.seenVolleys = 0;
    this.app.layout();
    this.dir.resetField();
    this.input = "";
    this.marks.clear();
    this.renderMarks();
    this.renderSlots();
    this.el.mineLog.innerHTML = "";
    this.el.theirLog.innerHTML = "";
    this.el.recent.hidden = true;
    this.clearPicks();
    this.sfx.play("found");
  }

  hurt(k) {
    play(document.querySelector(".hurt"), [{ opacity: Math.min(1, k) }, { opacity: 0 }], { duration: 900, easing: OUT });
    navigator.vibrate?.(k > 0.6 ? 40 : 15);
  }

  stamp(big, small = "", plain = false, short = false) {
    const st = this.el.stamp;
    st.dataset.n = String(Number(st.dataset.n || 0) + 1);
    st.querySelector("b").textContent = big;
    st.querySelector("span").textContent = small;
    st.classList.toggle("plain", plain);
    play(st, [
      { opacity: 0, transform: "scale(1.7) rotate(-7deg)", easing: OUT },
      { opacity: 1, transform: "scale(1) rotate(-3deg)", offset: 0.12, easing: OUT },
      { opacity: 1, transform: "scale(0.98) rotate(-3deg)", offset: 0.8, easing: OUT },
      { opacity: 0, transform: "scale(0.94) rotate(-3deg)" },
    ], { duration: short ? 1100 : 2100 });
  }

  // The logo variants land with the stamp: the skull for dead, the bandage for injured.
  stampLogos(dead, injured, cracked) {
    const hud = this.app.hud;
    const st = this.el.stamp;
    const fs = parseFloat(getComputedStyle(st.querySelector("b")).fontSize) || 90;
    const size = Math.max(58, Math.min(116, fs * 0.66));
    const y = st.offsetTop - size * 0.6 - 4;
    const cx = innerWidth / 2;
    const both = dead && injured;
    if (dead) {
      hud.place("dead", both ? cx - size * 0.62 : cx, y, size);
      hud.stamp("dead", { spin: cracked, hold: cracked ? 1.9 : 1.6 });
    }
    if (injured) {
      hud.place("injured", both ? cx + size * 0.62 : cx, y, size);
      hud.stamp("injured", { hold: 1.6 });
    }
  }

  showTaunt(id, who) {
    const side = who === "mine" ? "me" : "opp";
    const squad = this.app.army.squad(side).filter((s) => s.alive);
    const speaker = squad[Math.floor(squad.length / 2)] || this.app.army.squad(side)[1];
    this.say(speaker, TAUNTS[id] || "", 2400, side);
    this.sfx.play("taunt", { id, far: who === "opp" ? 0.3 : 0 });
    if (id === 0) for (const s of squad) s.salute();
    if (id === 3) for (const s of squad) s.cheer();
  }

  // Speech bubbles ride on the soldier who speaks.
  say(soldier, text, ms = 2200, side = "opp") {
    if (!soldier || !text) return;
    const b = this.bubbles.find((x) => !x.soldier) || this.bubbles.reduce((a, x) => (x.off < a.off ? x : a));
    clearTimeout(b.timer);
    b.soldier = soldier;
    b.off = performance.now() + ms;
    b.el.textContent = text;
    b.el.classList.toggle("opp", side === "opp");
    b.el.classList.add("on");
    b.timer = setTimeout(() => this.unsay(b), ms);
    this.pin();
  }

  unsay(b) {
    clearTimeout(b.timer);
    b.el.classList.remove("on");
    b.soldier = null;
  }

  pin() {
    const cam = this.app.stage.camera;
    const put = (el, soldier, lift) => {
      soldier.above(this.v3, lift).project(cam);
      el.style.left = `${Math.round((this.v3.x * 0.5 + 0.5) * innerWidth)}px`;
      el.style.top = `${Math.round((-this.v3.y * 0.5 + 0.5) * innerHeight)}px`;
    };
    for (const b of this.bubbles) if (b.soldier) put(b.el, b.soldier, 0.62);
    if (this.aimAt) put(this.el.reticle, this.aimAt, 0.05);
  }

  scope({ on, spot, kick }) {
    const sc = this.el.scope;
    if (on === true) {
      this.el.scopeTag.textContent = `Spot ${spot + 1}`;
      sc.classList.add("on");
    }
    if (on === false) sc.classList.remove("on", "kick");
    if (kick) {
      sc.classList.remove("kick");
      void sc.offsetWidth;
      sc.classList.add("kick");
    }
  }

  cine(on) {
    document.body.classList.toggle("cine", on);
    if (!on) this.app.layout();
    this.updateReticle();
  }

  oppAim(n) {
    const army = this.app.army;
    army.aim("opp", n > 0);
    this.app.world.cannons.opp.target = 0.35 + n * 0.07;
    this.sfx.play("aim");
    if (this.s?.turn === "opp" && !this.animating) this.el.turnLabel.textContent = n ? "Taking aim" : "Their shot";
    clearTimeout(this.aimOff);
    this.aimOff = setTimeout(() => {
      army.aim("opp", false);
      this.app.world.cannons.opp.target = 0.35;
      this.refresh();
    }, 2600);
  }

  presence(on) {
    const was = this.oppOnline;
    this.oppOnline = on;
    this.el.oppDot.classList.toggle("off", !on);
    this.el.oppDot.title = on ? "Online" : "Offline";
    if (this.solo || !this.oppSeen) {
      if (on) this.oppSeen = true;
      return;
    }
    if (was && !on) this.app.toast(`${this.oppName}'s radio went quiet`);
    if (!was && on) this.app.toast(`${this.oppName} is back on the radio`);
  }

  // ---- input --------------------------------------------------------------------------------

  canType() {
    const s = this.s;
    if (!s || this.markMode || this.ended) return false;
    if (s.phase === "deploy") return !s.me.secret;
    return s.phase === "battle";
  }

  press(d) {
    this.idleAt = performance.now();
    if (this.markMode) return this.cycleMark(d);
    if (!this.canType()) return;
    if (this.input.includes(d)) {
      play(this.el.slots, [0, -6, 5, -4, 2, 0].map((x) => ({ transform: `translateX(${x}px)` })), { duration: 360, fill: "none" });
      this.sfx.play("error");
      return this.app.toast("Each digit only once");
    }
    if (this.input.length >= 4) return;
    this.input += d;
    this.sfx.play("key", { digit: d });
    this.renderSlots(true);
    if (this.s.phase === "deploy") this.dir.setCode(this.input);
    if (this.s.phase === "battle" && this.s.turn === "me") {
      this.conn?.send({ t: "aim", n: this.input.length });
      this.app.army.aim("me", true);
      this.app.world.cannons.me.target = 0.35 + this.input.length * 0.07;
    }
    this.refresh();
  }

  back() {
    if (!this.canType() || !this.input) return;
    this.input = this.input.slice(0, -1);
    this.sfx.play("del");
    this.renderSlots();
    if (this.s.phase === "deploy") this.dir.setCode(this.input);
    if (this.s.phase === "battle" && this.s.turn === "me") {
      this.conn?.send({ t: "aim", n: this.input.length });
      this.app.world.cannons.me.target = 0.35 + this.input.length * 0.07;
    }
    this.refresh();
  }

  fire() {
    const s = this.s;
    if (!s || this.animating || this.firing) return;
    if (s.phase === "deploy" && !s.me.secret && isCode(this.input)) {
      this.firing = true;
      this.conn?.send({ t: "deploy", code: this.input });
      this.dir.lockCode();
      this.note(`<b>Code locked.</b> Waiting for ${this.oppName} to deploy.`);
      this.refresh();
    } else if (s.phase === "battle" && s.turn === "me" && isCode(this.input)) {
      this.firing = true;
      this.sfx.play("click");
      this.conn?.send({ t: "fire", guess: this.input });
      this.refresh();
    } else if (isCode(this.input) === false && this.input.length && (s.phase === "battle" || s.phase === "deploy")) {
      this.sfx.play("error");
      this.app.toast("Aim four different digits first");
    }
  }

  pick(p) {
    const s = this.s;
    if (!s || s.phase !== "supply" || s.me.pick || this.animating || this.picking) return;
    this.picking = true;
    this.sfx.play("drum", { n: 0 });
    this.conn?.send({ t: "pick", pick: p });
    for (const b of this.el.rps.querySelectorAll("button")) b.classList.toggle("picked", b.dataset.pick === p);
    this.note(`You picked <b>${p}</b>. Waiting for ${this.oppName}.`);
    setTimeout(() => (this.picking = false), 800);
    this.refresh();
  }

  // ---- the desk ---------------------------------------------------------------------------

  opened(name) {
    if (name === "log") this.markRead();
    if (POWERS.includes(name)) this.app.icons?.preview(name, this.windows[name].querySelector(".photo"));
    this.refresh();
  }

  // Closing a window clears it; minimising keeps it as it was.
  closed(name) {
    if (name === "aim" && this.canType() && this.input && !(this.s?.phase === "deploy" && this.s.me.secret)) {
      this.input = "";
      this.renderSlots();
      if (this.s?.phase === "deploy") this.dir.setCode("");
      if (this.s?.phase === "battle" && this.s.turn === "me") {
        this.conn?.send({ t: "aim", n: 0 });
        this.app.world.cannons.me.target = 0.35;
      }
    }
    if (name === "recon" || name === "sniper") this.clearPicks(name);
    this.refresh();
  }

  markRead() {
    this.unreadN = 0;
    this.el.unread.hidden = true;
  }

  logView(v) {
    const e = this.el;
    if (!["mine", "theirs", "both"].includes(v)) v = "mine";
    e.logs.dataset.show = v;
    for (const b of e.logSeg.querySelectorAll("[data-log]")) b.setAttribute("aria-selected", String(b.dataset.log === v));
    store("di.log", v);
  }

  picker(host, list, key, label, aria = null) {
    const kind = host.dataset.pickFor;
    host.innerHTML = list.map((v) => `<button type="button" data-v="${v}" aria-pressed="false"${aria ? ` aria-label="${aria(v)}"` : ""}>${label(v)}</button>`).join("");
    for (const b of host.querySelectorAll("button")) {
      b.addEventListener("click", () => {
        const on = b.getAttribute("aria-pressed") !== "true";
        for (const x of host.querySelectorAll("button")) x.setAttribute("aria-pressed", String(on && x === b));
        this.sel[kind][key] = on ? (key === "pos" ? Number(b.dataset.v) : b.dataset.v) : null;
        this.sfx.play("key", { digit: String(b.dataset.v) });
        this.idleAt = performance.now();
        this.refresh();
      });
    }
  }

  clearPicks(kind = null) {
    for (const k of kind ? [kind] : ["recon", "sniper"]) {
      this.sel[k] = {};
      for (const b of this.windows[k].querySelectorAll(".pick button")) b.setAttribute("aria-pressed", "false");
    }
    this.updateReticle();
  }

  canPower(kind) {
    const s = this.s;
    return !!s && s.phase === "battle" && s.turn === "me" && !this.animating && s.me.supplies > 0 && !s.me.powerUsed && !this.powerSent && !(kind === "smoke" && s.me.smoke);
  }

  usePower(kind) {
    if (!this.canPower(kind)) return;
    const sel = this.sel[kind] || {};
    if (kind !== "smoke" && (sel.digit == null || (kind === "sniper" && sel.pos == null))) return;
    this.conn?.send({ t: "power", kind, digit: sel.digit, pos: sel.pos });
    this.powerSent = true;
    this.sfx.play("stamp");
    store(`di.learned.${kind}`, "1");
    this.clearPicks(kind === "smoke" ? null : kind);
    this.desk.minimise(kind);
    this.refresh();
  }

  // The red ring over the enemy soldier your sniper would take, while you choose.
  updateReticle() {
    const pos = this.sel.sniper.pos;
    const show = pos != null && this.desk.isOpen("sniper") && !document.body.classList.contains("cine") && this.s?.phase === "battle";
    this.aimAt = show ? this.app.army.squad("opp")[pos] : null;
    this.el.reticle.classList.toggle("on", !!this.aimAt);
    if (this.aimAt) this.el.reticleTag.textContent = `Spot ${pos + 1}`;
  }

  cycleMark(d) {
    const cur = this.marks.get(d);
    const next = !cur ? "out" : cur === "out" ? "in" : null;
    this.setMark(d, next);
    this.sfx.play("tick", { hi: next === "in" });
  }

  setMark(d, mark) {
    if (mark) this.marks.set(d, mark);
    else this.marks.delete(d);
    this.renderMarks();
  }

  renderMarks() {
    for (const [d, b] of this.keys) {
      const m = this.marks.get(d);
      b.classList.toggle("out", m === "out");
      b.classList.toggle("in", m === "in");
    }
  }

  renderSlots(pop = false) {
    this.slotEls.forEach((el, i) => {
      const ch = this.input[i] || "";
      if (el.textContent !== ch) {
        el.textContent = ch;
        if (pop && ch) play(el, [{ transform: "translateY(-10px) scale(1.18)" }, { transform: "none" }], { duration: 320, easing: OUT, fill: "none" });
      }
    });
    for (const [d, b] of this.keys) b.classList.toggle("used", this.input.includes(d));
  }

  refresh() {
    const s = this.s;
    const e = this.el;
    if (!s) return;
    const busy = this.animating > 0;
    const my = s.phase === "battle" && s.turn === "me";
    for (const b of e.rps.querySelectorAll("button")) b.disabled = busy || !!s.me.pick;
    if (s.phase === "deploy") {
      e.fireBtn.textContent = s.me.secret ? "LOCKED" : "LOCK";
      e.fireBtn.disabled = !!s.me.secret || !isCode(this.input) || this.firing;
      if (s.me.secret && this.input !== s.me.secret) {
        this.input = s.me.secret;
        this.renderSlots();
      }
      if (s.me.secret) this.note(`<b>Code locked.</b> ${s.opp?.ready ? "Both codes are in." : `Waiting for ${this.oppName} to deploy.`}`);
    } else if (s.phase === "battle") {
      e.fireBtn.textContent = "FIRE";
      e.fireBtn.disabled = busy || !my || !isCode(this.input) || this.firing;
    }
    for (const kind of POWERS) this.refreshSupply(kind);
    this.refreshBar();
    this.updateReticle();
    e.delBtn.disabled = !this.canType() || !this.input;
    e.markBtn.disabled = s.phase !== "battle";
    e.randomBtn.disabled = s.phase !== "deploy" || !!s.me.secret;
    if (s.phase === "battle") {
      e.turn.classList.toggle("mine", my);
      e.turn.classList.toggle("last", !!s.lastStand);
      if (this.volleyBy) e.turnLabel.textContent = this.volleyBy === "me" ? "Firing" : "Incoming";
      else if (s.lastStand) e.turnLabel.textContent = my ? "Last stand" : "Their last stand";
      else e.turnLabel.textContent = my ? "Your shot" : "Their shot";
    } else {
      e.turn.classList.remove("mine", "last");
      e.turnLabel.textContent = { lobby: "Waiting", supply: "Supply draw", deploy: "Deploy" }[s.phase] || "";
    }
  }

  // Why a supply cannot go out right now, or "" when it can.
  why(kind) {
    const s = this.s;
    if (!s || s.phase !== "battle" || s.turn !== "me") return "Supplies go out on your turn";
    if (s.me.supplies < 1) return "No crates left";
    if (kind === "smoke" && s.me.smoke) return "Your smoke is already up";
    if (s.me.powerUsed || this.powerSent) return "One crate a turn";
    if (this.animating) return "Wait for the smoke to clear";
    return "";
  }

  // The icon's clay: full colour, dimmed when it is not your turn, a padlock once a crate went
  // out this turn, grey clay with none left.
  supplyState(kind) {
    const s = this.s;
    if (!s || s.phase !== "battle") return "dim";
    if (s.me.supplies < 1) return "grey";
    if (s.turn !== "me") return "dim";
    if (s.me.powerUsed || this.powerSent || (kind === "smoke" && s.me.smoke)) return "lock";
    return this.animating ? "dim" : "on";
  }

  refreshSupply(kind) {
    const w = this.windows[kind];
    const ok = this.canPower(kind);
    const sel = this.sel[kind] || {};
    const ready = ok && (kind === "smoke" || (sel.digit != null && (kind !== "sniper" || sel.pos != null)));
    const why = this.why(kind);
    const head = w.querySelector("[data-headline]");
    const text = why || { recon: "Send the spotter plane", sniper: "Take the shot", smoke: "Pop smoke" }[kind];
    if (head.textContent !== text) head.textContent = text;
    head.classList.toggle("why", !!why);
    const brief = w.querySelector("[data-brief]");
    const short = store(`di.learned.${kind}`) === "1";
    const btext = short ? brief.dataset.short : brief.dataset.brief;
    if (brief.textContent !== btext) brief.textContent = btext;
    w.classList.toggle("ready", ready);
    w.querySelector("[data-go]").disabled = !ready;
    for (const b of w.querySelectorAll(".pick button")) b.disabled = !ok;
  }

  refreshBar() {
    const s = this.s;
    if (!s) return;
    const e = this.el;
    const rules = s.orders || STANDARD_ORDERS;
    const armed = anySupply(rules);
    e.tbSupplies.hidden = !armed;
    e.bar.classList.toggle("bare", !armed);
    for (const kind of POWERS) {
      const b = e.bar.querySelector(`[data-open="${kind}"]`);
      b.hidden = !rules[kind];
      const st = this.supplyState(kind);
      b.dataset.clay = st;
      const why = this.why(kind);
      b.setAttribute("aria-description", why || "Ready");
      this.app.icons?.setState(kind, st);
      if (!rules[kind] && this.desk.state(kind) !== "closed") this.desk.close(kind);
    }
    const left = s.me.supplies;
    const text = `\u00d7${left}`;
    if (e.crateCount.textContent !== text) e.crateCount.textContent = text;
    e.tbCrates.setAttribute("aria-label", `${plural(left, "crate")} left`);
    e.tbCrates.classList.toggle("empty", left < 1);
    const logB = e.bar.querySelector('[data-open="log"]');
    logB.disabled = false;
    const my = s.phase === "battle" && s.turn === "me";
    this.app.icons?.setPulse("aim", my && !this.desk.isOpen("aim") && !this.animating);
    this.app.icons?.setState("aim", s.phase === "deploy" || my ? "on" : "dim");
  }

  renderLogs() {
    const s = this.s;
    const e = this.el;
    const row = (v) => {
      const g = v.miss ? '<span class="pill n">misfire</span>' : `<span class="guess">${v.guess.split("").map((c) => `<i>${c}</i>`).join("")}</span>`;
      let res = "";
      if (v.miss) res = "";
      else if (v.hits != null) res = `<span class="pill n">${plural(v.hits, "hit")} · smoke</span>`;
      else if (v.dead === 4) res = '<span class="pill w">cracked</span>';
      else res = `<span class="pill d">${v.dead} dead</span><span class="pill i">${v.injured} inj</span>`;
      return `<li class="v">${g}<span class="res">${res}</span></li>`;
    };
    const powerRow = (p) => {
      if (p.kind === "recon") return `<li class="power"><span><b>Recon</b> ${p.args.digit} ${p.result ? "is in their code" : "is not in their code"}</span></li>`;
      if (p.kind === "sniper") return `<li class="power"><span><b>Sniper</b> ${p.args.digit} ${p.result ? "is" : "is not"} in spot ${p.args.pos + 1}</span></li>`;
      return `<li class="power"><span><b>Smoke</b> hid your squad</span></li>`;
    };
    const mine = [];
    s.volleys.forEach((v, i) => {
      for (const p of s.powers) if (p.at === i) mine.push(powerRow(p));
      if (v.by === "me") mine.push(row(v));
    });
    for (const p of s.powers) if (p.at >= s.volleys.length) mine.push(powerRow(p));
    const theirs = s.volleys.filter((v) => v.by === "opp").map(row);
    e.mineLog.innerHTML = mine.length ? mine.join("") : '<li class="empty">No shots fired yet</li>';
    e.theirLog.innerHTML = theirs.length ? theirs.join("") : '<li class="empty">No incoming yet</li>';
    const mv = s.volleys.filter((v) => v.by === "me").length;
    const tv = theirs.length;
    e.logCount.textContent = mv + tv ? `${mv} out, ${tv} in` : "";
    const last = s.volleys.filter((v) => v.by === "me").pop();
    e.recent.hidden = !last;
    if (last) e.recent.innerHTML = `<b>Last shot</b>${row(last).replace(/^<li class="v">|<\/li>$/g, "")}`;
    e.mineLog.scrollTop = e.mineLog.scrollHeight;
    e.theirLog.scrollTop = e.theirLog.scrollHeight;
    const n = s.volleys.length;
    if (n < this.seenVolleys) this.seenVolleys = 0;
    if (n > this.seenVolleys) {
      if (!this.desk.isOpen("log")) this.unreadN += n - this.seenVolleys;
      this.seenVolleys = n;
    }
    e.unread.hidden = !this.unreadN;
    e.unread.textContent = String(this.unreadN);
    e.bar.querySelector('[data-open="log"]').setAttribute("aria-description", this.unreadN ? `${plural(this.unreadN, "new volley")}` : "");
  }

  // The match clock: minutes left in the battle, frozen while a match against the computer is paused.
  matchClock() {
    const s = this.s;
    const c = this.el.clock;
    const on = this.active && s?.phase === "battle" && s.clock != null;
    if (c.hidden === on) c.hidden = !on;
    if (!on) return;
    const now = this.conn?.paused ? this.conn.pausedAt : Date.now() + this.offset;
    const left = Math.min(s.clock - now, (s.orders || STANDARD_ORDERS).minutes * 60e3);
    const text = s.timeUp || left <= 0 ? "Time" : mmss(left);
    if (c.textContent !== text) c.textContent = text;
    c.classList.toggle("low", !s.timeUp && left < 60e3);
  }

  clock() {
    this.matchClock();
    const s = this.s;
    const t = this.el.timer;
    if (this.active && !this.ended && s?.phase === "battle" && s.turn === "me" && !this.animating && !this.firing && this.idleAt && performance.now() - this.idleAt > 11000) {
      this.idleAt = performance.now() + 5000;
      this.banner(this.input.length === 4 ? "Ready: hit Fire" : "Your shot", 3200);
      this.el.turn.classList.add("nudge");
      this.note(this.input.length === 4 ? "<b>Four digits aimed.</b> Hit Fire when you are ready." : anySupply(this.s.orders || STANDARD_ORDERS) && this.s.me.supplies > 0 ? "<b>Your shot.</b> Aim four digits, or open a supply on the bar." : "<b>Your shot.</b> Aim four digits on the keypad.", 4200);
    }
    const total = s?.phase === "battle" ? s.turnMs : PHASE_MS[s?.phase];
    if (!this.active || !s || !s.deadline || !total || this.animating || this.ended) {
      if (!t.hidden) t.hidden = true;
      return;
    }
    const left = s.deadline - (Date.now() + this.offset);
    if (left > total + 50) {
      if (!t.hidden) t.hidden = true;
      return;
    }
    t.hidden = false;
    const f = Math.max(0, Math.min(1, left / total));
    t.firstElementChild.style.transform = `scaleX(${f})`;
    const low = left < 10000;
    t.classList.toggle("low", low);
    const waiting = (s.phase === "battle" && s.turn === "me") || (s.phase === "supply" && !s.me.pick) || (s.phase === "deploy" && !s.me.secret);
    const sec = Math.ceil(left / 1000);
    if (low && waiting && sec !== this.lastTick && sec > 0) {
      this.lastTick = sec;
      this.sfx.play("tick", { hi: sec <= 3 });
    }
  }
}

// The word stamped over the field: the same one the director would drop in 3D.
function verdictWord(r) {
  if (!r) return null;
  const { winner, reason } = r;
  if (winner === "draw") return "STALEMATE";
  if (winner === "none") return null;
  if (reason === "time") return "TIME";
  if (winner === "me") return reason === "cracked" ? "CRACKED" : "VICTORY";
  return reason === "cracked" ? "OVERRUN" : "FORFEIT";
}

function verdictLine(text, winner, reason) {
  if (text === "TIME") return winner === "me" ? "closest to cracking" : "they came closer";
  if (text === "STALEMATE") return reason === "time" ? "neither side came closer" : "both codes fell";
  if (text === "CRACKED") return "enemy code broken";
  if (text === "OVERRUN") return "our code broken";
  if (text === "VICTORY") return reason === "left" ? "the enemy quit the field" : "the enemy misfired";
  if (text === "FORFEIT") return reason === "left" ? "field abandoned" : "three misfires";
  return "";
}

// A telegram number that both players share, from the room's code and the match count.
function telegramNo(s) {
  let h = s.match || 1;
  for (const c of String(s.code || "")) h = (h * 31 + c.charCodeAt(0)) % 9000;
  return 1000 + h;
}

function wait(s) {
  return new Promise((r) => gsap.delayedCall(s, r));
}
