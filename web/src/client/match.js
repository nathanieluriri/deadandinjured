import { gsap } from "gsap/gsap-core";
import { isCode, randomCode, anySupply, STANDARD_ORDERS } from "../shared/rules.js";
import { TIMES } from "../shared/game.js";

export const TAUNTS = ["Salute", "Fire in the hole!", "Ha ha ha", "Good game", "Come on then", "Boom"];
const PHASE_MS = { supply: TIMES.supply, deploy: TIMES.deploy };
const mmss = (ms) => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};
const bestText = (b) => (b && b.dead + b.injured ? `${b.dead} dead, ${b.injured} injured` : "nothing hit");
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
// One-shot effects run through the Web Animations API and cancel the previous run, so a
// replay never stacks on a finished one.
function play(el, frames, opts) {
  el.__anim?.cancel();
  el.__anim = el.animate(frames, { fill: "forwards", ...opts, duration: reduced() ? 1 : opts.duration });
  return el.__anim;
}

export class MatchView {
  constructor(app) {
    this.app = app;
    this.el = {};
    for (const id of ["note", "turn", "turnLabel", "timer", "meName", "oppName", "meCrates", "oppCrates", "oppDot", "slots", "pad", "fireBtn", "delBtn",
      "mineLog", "theirLog", "logCount", "logs", "logSeg", "overTitle", "overText", "overCodes", "overTag", "rematchBtn", "homeBtn", "leaveBtn",
      "rps", "stamp", "myCode", "taunts", "tauntBtn", "markBtn", "randomBtn", "panes", "switch", "recent", "deck", "deckNote", "deckDots",
      "crateBadge", "scope", "scopeTag", "say", "reticle", "reticleTag", "leaveDlg", "leaveText", "live", "clock"]) this.el[id] = $(id);
    this.slotEls = [...this.el.slots.children];
    this.keys = new Map([...this.el.pad.querySelectorAll("[data-d]")].map((b) => [b.dataset.d, b]));
    this.active = false;
    this.marks = new Map();
    this.sel = { recon: {}, sniper: {} };
    this.paneName = "aim";
    this.idleAt = 0;
    this.v3 = this.app.stage.camera.position.clone();
    const extra = this.el.say.cloneNode();
    extra.removeAttribute("id");
    document.body.append(extra);
    this.bubbles = [this.el.say, extra].map((el) => ({ el, soldier: null, off: 0 }));
    this.bind();
    this.logView(store("di.log") || "mine");
    this.dir.on("scope", (o) => this.scope(o));
    this.dir.on("say", ({ soldier, text, ms }) => this.say(soldier, text, ms, "opp"));
    this.app.stage.hooks.push(() => this.pin());
    const fit = new ResizeObserver(() => {
      this.fitPanes();
      this.thumb();
    });
    for (const el of [...this.el.panes.children, ...this.el.switch.querySelectorAll("[data-pane]")]) fit.observe(el);
    addEventListener("resize", () => this.pane(this.paneName));
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
    e.tauntBtn.addEventListener("click", () => this.taunts(e.taunts.hidden));
    e.taunts.innerHTML = TAUNTS.map((t, i) => `<button type="button" data-taunt="${i}">${t}</button>`).join("");
    for (const b of e.taunts.querySelectorAll("[data-taunt]")) {
      b.addEventListener("click", () => {
        const id = Number(b.dataset.taunt);
        this.conn?.send({ t: "taunt", id });
        this.showTaunt(id, "mine");
        this.taunts(false);
      });
    }
    for (const b of e.switch.querySelectorAll("[data-pane]")) {
      b.addEventListener("click", () => {
        this.pane(b.dataset.pane);
        this.sfx.play("click");
      });
    }
    for (const b of e.logSeg.querySelectorAll("[data-log]")) {
      b.addEventListener("click", () => {
        this.logView(b.dataset.log);
        this.sfx.play("click");
      });
    }
    e.recent.addEventListener("click", () => this.pane("log"));
    for (const host of document.querySelectorAll(".pick.digits")) this.picker(host, [..."1234567890"], "digit", (v) => v);
    for (const host of document.querySelectorAll(".pick.spots")) this.picker(host, [0, 1, 2, 3], "pos", (v) => `${SOLDIER}${v + 1}`);
    for (const b of document.querySelectorAll("[data-go]")) b.addEventListener("click", () => this.usePower(b.dataset.go));
    e.deck.addEventListener("scroll", () => this.deckDots(), { passive: true });
    e.rematchBtn.addEventListener("click", () => {
      if (this.solo) return this.app.solo(this.level);
      this.conn?.send({ t: "rematch" });
      e.rematchBtn.disabled = true;
      e.rematchBtn.textContent = `Waiting for ${this.s?.opp?.name || "them"}`;
    });
    e.homeBtn.addEventListener("click", () => this.app.home());
    e.leaveBtn.addEventListener("click", () => {
      if (!this.s || this.s.phase === "over" || this.s.phase === "lobby") return this.app.home();
      e.leaveText.textContent = this.solo ? "The computer keeps the field." : `Leaving now hands the win to ${this.s.opp?.name || "your opponent"}.`;
      e.leaveDlg.showModal();
    });
    e.leaveDlg.addEventListener("close", () => {
      if (e.leaveDlg.returnValue !== "go") return;
      this.conn?.send({ t: "leave" });
      this.app.home();
    });
    addEventListener("keydown", (ev) => {
      if (!this.active || document.querySelector("dialog[open]") || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (/^[0-9]$/.test(ev.key)) this.press(ev.key);
      else if (ev.key === "Backspace") this.back();
      else if (ev.key === "Enter") this.fire();
      else if (this.s?.phase === "supply" && "rps".includes(ev.key.toLowerCase())) this.pick({ r: "rock", p: "paper", s: "scissors" }[ev.key.toLowerCase()]);
      else return;
      ev.preventDefault();
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
    this.taunts(false);
    this.clearPicks();
    this.el.mineLog.innerHTML = "";
    this.el.theirLog.innerHTML = "";
    this.el.recent.hidden = true;
    this.setPhaseClass(null);
    this.renderSlots();
    this.pane("aim");
  }

  stop() {
    this.active = false;
    this.conn?.close();
    this.conn = null;
    this.setPhaseClass(null);
    this.cine(false);
    this.scope({ on: false });
    for (const b of this.bubbles) this.unsay(b);
    clearTimeout(this.aimOff);
  }

  enqueue(fn) {
    this.q = this.q.then(() => (this.active ? fn() : null)).catch((e) => console.error(e));
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
      case "joined": this.app.toast(`${m.name} joined the room`); break;
      case "ready": this.sfx.play("lock", { far: 0.8 }); this.app.toast(`${this.oppName} has deployed their code`); break;
      case "rematch": this.app.toast(`${this.oppName} wants a rematch`); this.sfx.play("radio"); break;
      case "taunt": this.showTaunt(m.id, "opp"); break;
      case "aim": this.oppAim(m.n); break;
      case "presence": this.presence(m.opp); break;
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
      await this.dir.shot("supply", prev ? 1.2 : 0.01);
      this.banner("Supply draw");
      this.note(this.drawNote(s));
    } else if (phase === "deploy") {
      this.dir.rpsShow(false);
      this.input = s.me.secret || "";
      this.renderSlots();
      this.dir.setCode(this.input, { sound: false });
      this.dir.crate(true);
      this.pane("aim");
      await this.dir.shot("deploy", prev ? 1.3 : 0.01);
      this.banner("Deploy");
      this.note(`<b>Hide your code:</b> four different digits. ${this.oppName} never sees it.`);
    } else if (phase === "battle") {
      this.dir.rpsShow(false);
      this.dir.setCode(s.me.secret, { sound: false });
      this.input = "";
      this.renderSlots();
      this.dir.crate(false);
      this.pane("aim");
      await this.dir.shot("home", prev ? 1.3 : 0.01);
      if (prev) {
        this.stamp("Battle", "stations", true);
        this.sfx.play(s.turn === "me" ? "bugle" : "radio");
      }
      this.idleAt = performance.now();
      this.banner(s.turn === "me" ? "Your shot" : "Their shot", 3200);
      this.note(s.turn === "me" ? "<b>You fire first.</b> Four digits on the keypad, then Fire." : `<b>${this.oppName} fires first.</b> Line up your reply.`);
    } else if (phase === "over") {
      this.pane("aim");
      this.banner("Ceasefire", 4000);
    }
    if (phase === "over" && !prev) {
      this.dir.setCode(s.me.secret || "", { sound: false });
      this.dir.shot("far", 0.01);
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
    this.animating++;
    this.refresh();
    this.sfx.mood("calm");
    this.note("");
    const cue = r.winner === "me" ? "fanfare" : r.winner === "opp" ? "taps" : r.winner === "draw" ? "horn" : null;
    if (cue) wait(0.6).then(() => this.sfx.play(cue));
    await this.dir.ending(r);
    if (this.solo && ["me", "opp", "draw"].includes(r.winner)) this.app.recordSolo({ me: "win", opp: "loss", draw: "draw" }[r.winner]);
    this.animating--;
    this.app.refreshMe();
  }

  fillOver(r) {
    const e = this.el;
    const s = this.s;
    const opp = this.oppName;
    const titles = {
      me: { cracked: `You cracked ${opp}'s code.`, left: `${opp} left the field.`, timeout: `${opp} misfired three times.`, time: "Time. You came closest to cracking it." },
      opp: { cracked: `${opp} cracked your code.`, left: "You left the field.", timeout: "You misfired three times.", time: `Time. ${opp} came closest to cracking it.` },
    };
    e.overTag.textContent = r.winner === "me" ? "victory" : r.winner === "opp" ? "defeat" : r.winner === "draw" ? "draw" : "closed";
    if (r.winner === "draw") e.overTitle.textContent = r.reason === "time" ? "Time. Neither side came closer." : "Both codes fell in the same round.";
    else if (r.winner === "none") e.overTitle.textContent = r.reason === "noshow" ? "Your opponent never arrived." : "The room closed.";
    else e.overTitle.textContent = titles[r.winner]?.[r.reason] || "The war is over.";
    const volleys = s?.volleys || [];
    const fired = volleys.filter((v) => v.by === "me" && !v.miss).length;
    const kills = volleys.filter((v) => v.by === "me").reduce((a, v) => a + (v.dead || 0), 0);
    const lost = volleys.filter((v) => v.by === "opp").reduce((a, v) => a + (v.dead || 0), 0);
    e.overText.textContent = r.winner === "none" ? "" : `${plural(fired, "volley")} fired, ${plural(kills, "enemy soldier")} down, ${lost} of yours lost.`;
    if (r.reason === "time" && r.best) {
      const verdict = r.winner === "me" ? "You win on the clock." : r.winner === "opp" ? `${opp} wins on the clock.` : "A stalemate on the clock.";
      e.overText.textContent = `Your best volley: ${bestText(r.best.me)}. ${opp}'s best: ${bestText(r.best.opp)}. ${verdict}`;
    }
    const tiles = (code, cls) => `<span class="tiles ${cls}">${(code || "????").split("").map((c) => `<i>${c}</i>`).join("")}</span>`;
    e.overCodes.innerHTML = `<div><span class="eyebrow">Your code</span>${tiles(r.codes?.me, "")}</div><div><span class="eyebrow">${opp}'s code</span>${tiles(r.codes?.opp, "opp")}</div>`;
    const canRematch = this.solo || ["cracked", "timeout", "time"].includes(r.reason);
    e.rematchBtn.hidden = !canRematch;
    if (!s?.rematch?.me) {
      e.rematchBtn.disabled = false;
      e.rematchBtn.textContent = this.solo ? "Play again" : "Rematch";
    }
  }

  async restart() {
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
    if (on) this.taunts(false);
    else this.app.layout();
    this.updateReticle();
  }

  taunts(open) {
    const e = this.el;
    e.taunts.hidden = !open;
    e.tauntBtn.setAttribute("aria-expanded", String(!!open));
    if (open) this.sfx.play("click");
    this.app.layout?.();
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
    if (!s || this.markMode) return false;
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

  // ---- the dock ---------------------------------------------------------------------------

  desk() {
    return innerWidth >= 900;
  }

  pane(name) {
    const e = this.el;
    const order = ["aim", "supplies", "log"];
    if (!order.includes(name) || (name === "log" && this.desk()) || (this.s?.phase === "deploy" && name !== "aim")) name = "aim";
    this.paneName = name;
    const i = order.indexOf(name);
    e.panes.style.setProperty("--p", i);
    for (const b of e.switch.querySelectorAll("[data-pane]")) b.setAttribute("aria-selected", String(b.dataset.pane === name));
    for (const p of e.panes.children) p.inert = p.dataset.pane !== name && !(p.dataset.pane === "log" && this.desk());
    this.idleAt = performance.now();
    this.fitPanes();
    this.thumb();
    this.updateReticle();
    this.app.layout?.();
  }

  thumb() {
    const b = this.el.switch.querySelector(`[data-pane="${this.paneName}"]`);
    if (!b?.offsetWidth) return;
    this.el.switch.style.setProperty("--x", `${b.offsetLeft}px`);
    this.el.switch.style.setProperty("--w", `${b.offsetWidth}px`);
  }

  // The dock is as tall as the pane on show, so the keypad does not reserve the supply cards' height.
  fitPanes() {
    const p = [...this.el.panes.children].find((x) => x.dataset.pane === this.paneName);
    if (p) this.el.panes.style.height = `${p.offsetHeight}px`;
  }

  logView(v) {
    const e = this.el;
    if (!["mine", "theirs", "both"].includes(v)) v = "mine";
    e.logs.dataset.show = v;
    for (const b of e.logSeg.querySelectorAll("[data-log]")) b.setAttribute("aria-selected", String(b.dataset.log === v));
    store("di.log", v);
  }

  picker(host, list, key, label) {
    const kind = host.dataset.pickFor;
    host.innerHTML = list.map((v) => `<button type="button" data-v="${v}" aria-pressed="false">${label(v)}</button>`).join("");
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

  clearPicks() {
    this.sel = { recon: {}, sniper: {} };
    for (const b of document.querySelectorAll(".pick button")) b.setAttribute("aria-pressed", "false");
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
    this.sfx.play("click");
    this.clearPicks();
    this.pane("aim");
    this.refresh();
  }

  deckDots() {
    const d = this.el.deck;
    const card = d.firstElementChild;
    const i = card ? Math.round(d.scrollLeft / (card.offsetWidth + 10)) : 0;
    [...this.el.deckDots.children].forEach((dot, k) => dot.classList.toggle("on", k === i));
  }

  // The red ring over the enemy soldier your sniper would take, while you choose.
  updateReticle() {
    const pos = this.sel.sniper.pos;
    const show = pos != null && this.paneName === "supplies" && !document.body.classList.contains("cine") && this.s?.phase === "battle";
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
    const why = !my ? "Supplies go out on your turn" : s.me.supplies < 1 ? "No crates left" : s.me.powerUsed || this.powerSent ? "One crate a turn" : "";
    const rules = s.orders || STANDARD_ORDERS;
    for (const card of e.deck.children) {
      const kind = card.dataset.power;
      card.hidden = !rules[kind];
      const ok = this.canPower(kind);
      const sel = this.sel[kind] || {};
      const ready = ok && (kind === "smoke" || (sel.digit != null && (kind !== "sniper" || sel.pos != null)));
      card.classList.toggle("off", !ok && !busy);
      card.classList.toggle("ready", ready);
      card.querySelector("[data-go]").disabled = !ready;
      for (const b of card.querySelectorAll(".pick button")) b.disabled = !ok;
    }
    const left = s.me.supplies;
    e.deckNote.textContent = why || (s.me.smoke ? `Smoke is up. ${plural(left, "crate")} left` : `${plural(left, "crate")} left`);
    e.crateBadge.textContent = s.phase === "battle" && left ? String(left) : "";
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
      e.turnLabel.textContent = { lobby: "Waiting", supply: "Supply draw", deploy: "Deploy", over: "Ceasefire" }[s.phase] || "";
    }
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
      return `<li>${g}<span class="res">${res}</span></li>`;
    };
    const powerRow = (p) => {
      if (p.kind === "recon") return `<li class="power"><span><b>Recon</b> ${p.args.digit} ${p.result ? "is in their code" : "is not in their code"}</span></li>`;
      if (p.kind === "sniper") return `<li class="power"><span><b>Sniper</b> ${p.args.digit} ${p.result ? "is" : "is not"} in spot ${p.args.pos + 1}</span></li>`;
      return `<li class="power"><span><b>Smoke</b> hid your squad</span></li>`;
    };
    const mine = [];
    let at = 0;
    s.volleys.forEach((v, i) => {
      for (const p of s.powers) if (p.at === i && p.at >= at) mine.push(powerRow(p));
      at = i + 1;
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
    if (last) e.recent.innerHTML = `<b>Last shot</b>${row(last).replace(/^<li>|<\/li>$/g, "")}`;
    e.mineLog.scrollTop = e.mineLog.scrollHeight;
    e.theirLog.scrollTop = e.theirLog.scrollHeight;
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
    if (this.active && s?.phase === "battle" && s.turn === "me" && !this.animating && !this.firing && this.idleAt && performance.now() - this.idleAt > 11000) {
      this.idleAt = performance.now() + 5000;
      this.banner(this.input.length === 4 ? "Ready: hit Fire" : "Your shot", 3200);
      this.el.turn.classList.add("nudge");
      this.note(this.input.length === 4 ? "<b>Four digits aimed.</b> Hit Fire when you are ready." : "<b>Your shot.</b> Aim four digits, or spend a crate from Supplies.", 4200);
    }
    const total = s?.phase === "battle" ? s.turnMs : PHASE_MS[s?.phase];
    if (!this.active || !s || !s.deadline || !total || this.animating) {
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

function wait(s) {
  return new Promise((r) => gsap.delayedCall(s, r));
}
