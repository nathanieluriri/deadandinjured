import { gsap } from "gsap";
import { isCode, randomCode } from "../shared/rules.js";
import { TIMES } from "../shared/game.js";

export const TAUNTS = ["Salute", "Fire in the hole!", "Ha ha ha", "Good game", "Come on then", "Boom"];
const PHASE_MS = { supply: TIMES.supply, deploy: TIMES.deploy, battle: TIMES.turn };
const $ = (id) => document.getElementById(id);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export class MatchView {
  constructor(app) {
    this.app = app;
    this.el = {};
    for (const id of ["note", "turn", "turnLabel", "timer", "meName", "oppName", "meCrates", "oppCrates", "oppDot", "slots", "pad", "fireBtn", "delBtn",
      "mineLog", "theirLog", "mineCount", "theirCount", "overTitle", "overText", "overCodes", "overTag", "rematchBtn", "homeBtn", "leaveBtn",
      "rps", "stamp", "bubble", "myCode", "taunts", "tauntBtn", "logBtn", "markBtn", "randomBtn", "powerDlg", "powerForm", "powerHead", "powerText",
      "powerDigits", "powerSpots", "powerTag", "leaveDlg", "leaveText", "live"]) this.el[id] = $(id);
    this.slotEls = [...this.el.slots.children];
    this.keys = new Map([...this.el.pad.querySelectorAll("[data-d]")].map((b) => [b.dataset.d, b]));
    this.active = false;
    this.marks = new Map();
    this.bind();
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
    for (const b of document.querySelectorAll("[data-power]")) b.addEventListener("click", () => this.power(b.dataset.power));
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
    e.tauntBtn.addEventListener("click", () => {
      e.taunts.hidden = !e.taunts.hidden;
      this.sfx.play("click");
      this.app.layout();
    });
    e.taunts.innerHTML = TAUNTS.map((t, i) => `<button type="button" data-taunt="${i}">${t}</button>`).join("");
    for (const b of e.taunts.querySelectorAll("[data-taunt]")) {
      b.addEventListener("click", () => {
        const id = Number(b.dataset.taunt);
        this.conn?.send({ t: "taunt", id });
        this.showTaunt(id, "mine");
        e.taunts.hidden = true;
        this.app.layout();
      });
    }
    e.logBtn.addEventListener("click", () => {
      document.body.classList.toggle("show-log");
      this.sfx.play("click");
    });
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
    e.powerForm.addEventListener("submit", () => {
      const p = this.pending;
      if (!p || e.powerDlg.returnValue === "cancel") return;
      if (p.kind !== "smoke" && (p.digit == null || (p.kind === "sniper" && p.pos == null))) return;
      this.conn?.send({ t: "power", ...p });
      this.powerSent = true;
      this.refresh();
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
    this.lastTick = -1;
    this.el.taunts.hidden = true;
    this.el.mineLog.innerHTML = "";
    this.el.theirLog.innerHTML = "";
    this.setPhaseClass(null);
    this.renderSlots();
  }

  stop() {
    this.active = false;
    this.conn?.close();
    this.conn = null;
    this.setPhaseClass(null);
    document.body.classList.remove("show-log");
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
      case "restart": this.enqueue(() => this.restart()); break;
      case "assigned": this.enqueue(() => this.app.toast(`Out of time: HQ assigned your code, ${m.code}`)); break;
      case "picked": this.sfx.play("click"); this.note(`<b>${this.oppName}</b> has picked`); break;
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
      this.update(s, prev);
      await this.enterPhase(s.phase, fresh ? null : prev);
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
    const crates = (n) => (n ? `${plural(n, "crate")}` : "no crates");
    e.meCrates.textContent = s.phase === "battle" || s.phase === "over" ? crates(s.me.supplies) : "";
    e.oppCrates.textContent = s.opp && (s.phase === "battle" || s.phase === "over") ? crates(s.opp.supplies) : "";
    if (s.phase === "battle" && prev && prev.phase === "battle" && prev.turn !== s.turn && !this.turnSeen?.has(`${s.match}:${s.volleys.length}`)) {
      (this.turnSeen ||= new Set()).add(`${s.match}:${s.volleys.length}`);
      if (s.turn === "me") {
        this.sfx.play("bugle");
        this.announce("Your shot.");
      } else this.sfx.play("radio");
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
      this.note(`<b>Supply draw.</b> Rock, paper or scissors: the winner takes 3 crates, the loser 2 and the first shot.`);
    } else if (phase === "deploy") {
      this.dir.rpsShow(false);
      this.input = s.me.secret || "";
      this.renderSlots();
      this.dir.setCode(this.input, { sound: false });
      this.dir.crate(true);
      await this.dir.shot("deploy", prev ? 1.3 : 0.01);
      this.note(`<b>Deploy your code:</b> four different digits. ${this.oppName} never sees it.`);
    } else if (phase === "battle") {
      this.dir.rpsShow(false);
      this.dir.setCode(s.me.secret, { sound: false });
      this.input = "";
      this.renderSlots();
      this.dir.crate(false);
      await this.dir.shot("home", prev ? 1.3 : 0.01);
      if (prev) {
        this.stamp("Battle", "stations", true);
        this.sfx.play(s.turn === "me" ? "bugle" : "radio");
      }
      this.note(s.turn === "me" ? "<b>You fire first.</b> Aim with the keypad." : `<b>${this.oppName} fires first.</b> Line up your shot.`);
    } else if (phase === "over" && !prev) {
      this.dir.setCode(s.me.secret || "", { sound: false });
      this.dir.shot("far", 0.01);
    }
  }

  note(html) {
    this.el.note.innerHTML = html || "";
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
    } else if (m.result === "win") {
      this.stamp("3 crates", "won the draw", true);
      this.sfx.play("yes");
      this.note(`You take <b>3 crates</b>. ${this.oppName} gets 2 and fires first.`);
    } else {
      this.stamp("2 crates", "and the first shot", true);
      this.note(`${this.oppName} takes 3 crates. You get <b>2 and the first shot</b>.`);
    }
    await wait(1.2);
    this.animating--;
    this.refresh();
  }

  async playVolley(v) {
    this.animating++;
    this.refresh();
    this.note("");
    if (v.by === "me") {
      this.el.slots.classList.add("fly");
      await wait(0.5);
      this.el.slots.classList.remove("fly");
      this.input = "";
      this.renderSlots();
    }
    this.dir.on("result", (r) => this.stampVolley(r));
    this.dir.on("hurt", (k) => this.hurt(k));
    await this.dir.volley(v);
    this.dir.on("result", null);
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
    const e = this.el;
    if (p.by === "me") {
      if (p.kind === "recon") {
        this.sfx.play("recon");
        await wait(0.9);
        this.sfx.play(p.result ? "yes" : "no");
        this.stamp(`${p.args.digit} ${p.result ? "is in" : "is out"}`, "recon report", true);
        this.setMark(p.args.digit, p.result ? "in" : "out");
      } else if (p.kind === "sniper") {
        this.sfx.play("sniper");
        this.dir.shake(0.2);
        await wait(0.8);
        this.sfx.play(p.result ? "yes" : "no");
        this.stamp(p.result ? "Dead on" : "Clean miss", `${p.args.digit} in spot ${p.args.pos + 1} ${p.result ? "confirmed" : "ruled out"}`, true);
        if (p.result) this.setMark(p.args.digit, "in");
      } else {
        this.sfx.play("smoke");
        this.dir.smoke("me", true);
        this.stamp("Smoke up", "their next volley is blind", true);
      }
      await wait(1.1);
    } else {
      const text = { recon: "sent a recon plane", sniper: "has a sniper on you", smoke: "popped smoke" }[p.kind];
      this.sfx.play(p.kind === "smoke" ? "smoke" : p.kind === "sniper" ? "sniper" : "recon", { far: 0.6 });
      if (p.kind === "smoke") this.dir.smoke("opp", true);
      this.app.toast(`${this.oppName} ${text}`);
      await wait(1);
    }
    this.powerSent = false;
    this.animating--;
    this.refresh();
    e.powerDlg.open && e.powerDlg.close();
  }

  async playLastStand(m) {
    this.stamp("Last stand", m.by === "me" ? "they get one shot back" : "one shot to draw level");
    this.sfx.play("siren");
    this.sfx.mood("tension");
    this.note(m.by === "me" ? `You cracked it first. <b>${this.oppName}</b> gets one last shot to draw level.` : "<b>Your code is cracked.</b> One last shot to draw level.");
    await wait(2.2);
  }

  async playOver(r) {
    this.animating++;
    this.refresh();
    this.sfx.mood("calm");
    this.note("");
    const cue = r.winner === "me" ? "fanfare" : r.winner === "opp" ? "taps" : r.winner === "draw" ? "horn" : null;
    if (cue) wait(0.6).then(() => this.sfx.play(cue));
    await this.dir.ending(r);
    if (this.solo && (r.winner === "me" || r.winner === "opp")) this.app.recordSolo(r.winner === "me" ? "win" : "loss");
    this.animating--;
    this.app.refreshMe();
  }

  fillOver(r) {
    const e = this.el;
    const s = this.s;
    const opp = this.oppName;
    const titles = {
      me: { cracked: `You cracked ${opp}'s code.`, left: `${opp} left the field.`, timeout: `${opp} ran out the clock.` },
      opp: { cracked: `${opp} cracked your code.`, left: "You left the field.", timeout: "You ran out the clock." },
    };
    e.overTag.textContent = r.winner === "me" ? "victory" : r.winner === "opp" ? "defeat" : r.winner === "draw" ? "draw" : "closed";
    if (r.winner === "draw") e.overTitle.textContent = "Both codes fell in the same round.";
    else if (r.winner === "none") e.overTitle.textContent = r.reason === "noshow" ? "Your opponent never arrived." : "The room closed.";
    else e.overTitle.textContent = titles[r.winner]?.[r.reason] || "The war is over.";
    const volleys = s?.volleys || [];
    const fired = volleys.filter((v) => v.by === "me" && !v.miss).length;
    const kills = volleys.filter((v) => v.by === "me").reduce((a, v) => a + (v.dead || 0), 0);
    const lost = volleys.filter((v) => v.by === "opp").reduce((a, v) => a + (v.dead || 0), 0);
    e.overText.textContent = r.winner === "none" ? "" : `${plural(fired, "volley")} fired, ${plural(kills, "enemy soldier")} down, ${lost} of yours lost.`;
    const tiles = (code, cls) => `<span class="tiles ${cls}">${(code || "????").split("").map((c) => `<i>${c}</i>`).join("")}</span>`;
    e.overCodes.innerHTML = `<div><span class="eyebrow">Your code</span>${tiles(r.codes?.me, "")}</div><div><span class="eyebrow">${opp}'s code</span>${tiles(r.codes?.opp, "opp")}</div>`;
    const canRematch = this.solo || ["cracked", "timeout"].includes(r.reason);
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
    this.sfx.play("found");
  }

  hurt(k) {
    const h = document.querySelector(".hurt");
    h.style.opacity = "";
    h.classList.remove("on");
    void h.offsetWidth;
    h.style.setProperty("--k", Math.min(1, k));
    h.classList.add("on");
    navigator.vibrate?.(k > 0.6 ? 40 : 15);
  }

  stamp(big, small = "", plain = false, short = false) {
    const st = this.el.stamp;
    st.querySelector("b").textContent = big;
    st.querySelector("span").textContent = small;
    st.classList.remove("on", "plain", "short");
    void st.offsetWidth;
    st.classList.toggle("plain", plain);
    st.classList.toggle("short", short);
    st.classList.add("on");
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
      hud.stamp("dead", { spin: cracked, hold: cracked ? 2.4 : 1.6 });
    }
    if (injured) {
      hud.place("injured", both ? cx + size * 0.62 : cx, y, size);
      hud.stamp("injured", { hold: 1.6 });
    }
  }

  showTaunt(id, who) {
    const b = this.el.bubble;
    b.textContent = TAUNTS[id] || "";
    b.classList.toggle("mine", who === "mine");
    b.classList.add("on");
    clearTimeout(this.bubbleOff);
    this.bubbleOff = setTimeout(() => b.classList.remove("on"), 2200);
    this.sfx.play("taunt", { id, far: who === "opp" ? 0.3 : 0 });
    const squad = this.app.army.squad(who === "mine" ? "me" : "opp");
    if (id === 0) for (const s of squad) s.salute();
    if (id === 3) for (const s of squad) s.cheer();
  }

  oppAim(n) {
    const army = this.app.army;
    army.aim("opp", n > 0);
    this.app.world.cannons.opp.target = 0.35 + n * 0.07;
    this.sfx.play("aim");
    if (this.s?.turn === "opp" && !this.animating) this.el.turnLabel.textContent = n ? `${this.oppName} is aiming` : `${this.oppName}'s shot`;
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
    if (was && !on && this.s?.opp) this.app.toast(`${this.oppName}'s radio went quiet`);
    if (!was && on && this.s?.opp) this.app.toast(`${this.oppName} is back on the radio`);
  }

  // ---- input --------------------------------------------------------------------------------

  canType() {
    const s = this.s;
    if (!s || this.markMode) return false;
    if (s.phase === "deploy") return !s.me.secret;
    return s.phase === "battle";
  }

  press(d) {
    if (this.markMode) return this.cycleMark(d);
    if (!this.canType()) return;
    if (this.input.includes(d)) {
      this.el.slots.classList.remove("shake");
      void this.el.slots.offsetWidth;
      this.el.slots.classList.add("shake");
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

  power(kind) {
    const s = this.s;
    if (!s || s.phase !== "battle" || s.turn !== "me" || this.animating || s.me.powerUsed || s.me.supplies < 1) return;
    this.sfx.play("click");
    const e = this.el;
    this.pending = { kind };
    e.powerTag.textContent = kind;
    e.powerDigits.innerHTML = "";
    e.powerSpots.innerHTML = "";
    const pickBtns = (host, list, key, label) => {
      host.innerHTML = list.map((v) => `<button type="button" data-v="${v}" aria-pressed="false">${label(v)}</button>`).join("");
      for (const b of host.querySelectorAll("button")) {
        b.addEventListener("click", () => {
          for (const x of host.querySelectorAll("button")) x.setAttribute("aria-pressed", String(x === b));
          this.pending[key] = key === "pos" ? Number(b.dataset.v) : b.dataset.v;
          this.sfx.play("key", { digit: b.dataset.v });
        });
      }
    };
    if (kind === "recon") {
      e.powerHead.textContent = "Recon: is this digit in their code?";
      e.powerText.textContent = "A yes or no on one digit, anywhere in their code.";
      pickBtns(e.powerDigits, [..."1234567890"], "digit", (v) => v);
    } else if (kind === "sniper") {
      e.powerHead.textContent = "Sniper: is this digit in this spot?";
      e.powerText.textContent = "Pick a digit and one of the four spots.";
      pickBtns(e.powerDigits, [..."1234567890"], "digit", (v) => v);
      pickBtns(e.powerSpots, [0, 1, 2, 3], "pos", (v) => `Spot ${v + 1}`);
    } else {
      e.powerHead.textContent = "Smoke: blind their next volley";
      e.powerText.textContent = "Their next shot only reports total hits, not dead and injured.";
    }
    e.powerDlg.showModal();
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
        if (pop && ch) {
          el.classList.remove("pop");
          void el.offsetWidth;
          el.classList.add("pop");
        }
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
    for (const b of document.querySelectorAll("[data-power]")) {
      b.disabled = busy || !my || s.me.supplies < 1 || s.me.powerUsed || this.powerSent || (b.dataset.power === "smoke" && s.me.smoke);
    }
    e.delBtn.disabled = !this.canType() || !this.input;
    e.randomBtn.disabled = s.phase !== "deploy" || !!s.me.secret;
    if (s.phase === "battle") {
      e.turn.classList.toggle("mine", my);
      e.turn.classList.toggle("last", !!s.lastStand);
      if (busy) e.turnLabel.textContent = "Incoming";
      else if (s.lastStand) e.turnLabel.textContent = my ? "Last stand: your shot" : "Last stand";
      else e.turnLabel.textContent = my ? "Your shot" : `${this.oppName}'s shot`;
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
    e.mineCount.textContent = mv ? plural(mv, "volley") : "";
    e.theirCount.textContent = tv ? plural(tv, "volley") : "";
    e.mineLog.scrollTop = e.mineLog.scrollHeight;
    e.theirLog.scrollTop = e.theirLog.scrollHeight;
  }

  clock() {
    const s = this.s;
    const t = this.el.timer;
    if (!this.active || !s || !s.deadline || !PHASE_MS[s.phase] || this.animating) {
      if (!t.hidden) t.hidden = true;
      return;
    }
    const total = PHASE_MS[s.phase];
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
