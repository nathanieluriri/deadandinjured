import * as THREE from "three";
import { gsap } from "gsap/gsap-core";
import { SIDES, groundHeight } from "./palette.js";
import { glyph, word, clay, CodeBlocks } from "./type3d.js";
import { buildRps } from "./rps.js";
import { buildPlane } from "./plane.js";

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const wait = (s) => new Promise((r) => gsap.delayedCall(s, r));
const rnd = (a, b) => a + Math.random() * (b - a);
const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const other = (side) => (side === "me" ? "opp" : "me");

const SHOTS = {
  title: { pos: [0, 2.8, 21], look: [0, 7.2, -16], fov: 44, kp: 1.3 },
  home: { pos: [0, 4.4, 17.2], look: [0, 1.1, -5], fov: 40, kp: 1.45 },
  deploy: { pos: [0, 2.9, 15.4], look: [0, 1.05, 9.6], fov: 38 },
  supply: { pos: [0, 4.4, 2.6], look: [0, 4.4, -7], fov: 44, kp: 1.3 },
  launch: { pos: [8.8, 2.3, 11.2], look: [2.6, 3.2, -6], fov: 42 },
  enemyFront: { pos: [0.8, 3.1, -6.6], look: [0, 1.2, -18.5], fov: 40 },
  sky: { pos: [0.4, 1.5, 12.5], look: [0, 7.2, -8], fov: 46 },
  homeFront: { pos: [1.2, 2.8, -4.4], look: [0, 1.3, 6.3], fov: 40 },
  reveal: { pos: [0, 3.2, -9.5], look: [0, 2.2, -21.5], fov: 40 },
  mine: { pos: [0, 3.3, 16.2], look: [0, 1.5, 9], fov: 40 },
  far: { pos: [0, 6.5, 26], look: [0, 3.5, -12], fov: 42 },
};

export class Director {
  constructor({ stage, world, army, fx, sfx }) {
    Object.assign(this, { stage, world, army, fx, sfx });
    this.cam = stage.camera;
    this.pos = V(0, 3, 22);
    this.look = V(0, 5, -16);
    this.fov = 44;
    this.shakeAmt = 0;
    this.time = 0;
    this.name = "title";
    this.handheld = 1;
    this.orbit = 0;
    this.hooks = {};

    this.codes = { me: new CodeBlocks(stage.scene, "me"), opp: new CodeBlocks(stage.scene, "opp") };
    this.codes.me.group.visible = false;
    this.codes.opp.group.position.y = -2.4;
    this.codes.opp.group.visible = false;

    this.hot = new THREE.MeshStandardMaterial({ color: 0xffb070, emissive: 0xff5c12, emissiveIntensity: 2.4, roughness: 0.4 });
    this.shells = Array.from({ length: 4 }, () => {
      const m = new THREE.Mesh(glyph("0", 0.95, 0.3), this.hot);
      m.visible = false;
      stage.scene.add(m);
      return m;
    });

    this.planes = { me: buildPlane(SIDES.me.clay, 0x2b2622), opp: buildPlane(SIDES.opp.clay, 0xf2e8d8) };
    for (const p of Object.values(this.planes)) {
      p.visible = false;
      stage.scene.add(p);
    }
    this.beam = new THREE.Mesh(
      new THREE.ConeGeometry(2.4, 1, 28, 1, true).translate(0, -0.5, 0),
      new THREE.MeshBasicMaterial({ color: 0xfff0c4, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
    );
    this.beam.visible = false;
    stage.scene.add(this.beam);
    this.sway = 0;
    this.follow = null;

    this.titleMat = clay(0xf4efe6, 0.4);
    this.titleMat.emissive.setHex(0x221e1a);
    this.titleMat.envMapIntensity = 1.3;
    this.buildTitle();
    this.words = {};
    this.rps = this.buildRps();

    stage.hooks.push((dt) => this.update(dt));
    stage.onResize = () => this.applyShot(this.name, true);
    army.on("landed", (s) => {
      fx.dust(s.middle().setY(s.pos.y), 7, 1.1);
      sfx.play("thud", { pan: this.pan(s.pos), far: this.far(s.pos) });
    });
    army.on("risen", (s) => fx.dust(s.pos.clone(), 4, 0.7));
  }

  on(name, fn) {
    this.hooks[name] = fn;
  }

  emit(name, arg) {
    this.hooks[name]?.(arg);
  }

  pan(p) {
    const v = p.clone().project(this.cam);
    return Math.max(-1, Math.min(1, v.x * 0.8));
  }

  far(p) {
    return Math.min(1, this.cam.position.distanceTo(p) / 40);
  }

  shotFor(name) {
    const s = SHOTS[name];
    const a = this.stage.aspect;
    const kp = s.kp || 1.7;
    const k = a < 0.62 ? kp : a < 0.9 ? 1 + (kp - 1) * 0.6 : a < 1.25 ? 1 + (kp - 1) * 0.23 : 1;
    const look = V(...s.look);
    const off = V(...s.pos).sub(look);
    off.x *= k;
    off.z *= k;
    off.y *= 1 + (k - 1) * 0.35;
    const pos = look.clone().add(off);
    pos.y = Math.max(pos.y, groundHeight(pos.x, pos.z) + 1.3);
    return { pos, look, fov: s.fov + (a < 0.9 ? 8 : 0) };
  }

  applyShot(name, instant = false) {
    this.name = name;
    if (!instant) return;
    const s = this.shotFor(name);
    this.pos.copy(s.pos);
    this.look.copy(s.look);
    this.fov = s.fov;
  }

  shot(name, dur = 1.2, ease = "power3.inOut") {
    this.name = name;
    const s = this.shotFor(name);
    gsap.killTweensOf([this.pos, this.look, this]);
    if (dur <= 0) {
      this.applyShot(name, true);
      return Promise.resolve();
    }
    return new Promise((done) => {
      gsap.to(this.pos, { x: s.pos.x, y: s.pos.y, z: s.pos.z, duration: dur, ease });
      gsap.to(this.look, { x: s.look.x, y: s.look.y, z: s.look.z, duration: dur, ease });
      gsap.to(this, { fov: s.fov, duration: dur, ease, onComplete: done });
    });
  }

  // A camera move to any framing, for the moments that follow one soldier or one plane.
  move(pos, look, fov, dur = 1, ease = "power3.inOut") {
    gsap.killTweensOf([this.pos, this.look, this]);
    return new Promise((done) => {
      gsap.to(this.pos, { x: pos.x, y: pos.y, z: pos.z, duration: dur, ease });
      gsap.to(this.look, { x: look.x, y: look.y, z: look.z, duration: dur, ease });
      gsap.to(this, { fov, duration: dur, ease, onComplete: done });
    });
  }

  shake(a) {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) a *= 0.25;
    this.shakeAmt = Math.min(1.2, Math.max(this.shakeAmt, a));
  }

  slowmo(scale = 0.35, hold = 0.45) {
    const st = this.stage;
    gsap.killTweensOf(st, "timeScale");
    st.timeScale = scale;
    gsap.globalTimeline.timeScale(scale);
    return new Promise((r) => setTimeout(() => {
      gsap.globalTimeline.timeScale(1);
      gsap.to(st, { timeScale: 1, duration: 0.35, ease: "power2.in" });
      r();
    }, hold * 1000));
  }

  update(dt) {
    this.time += dt;
    this.shakeAmt *= Math.exp(-dt * 5);
    const t = this.time;
    if (this.follow) this.look.lerp(this.follow.position, 1 - Math.exp(-dt * 10));
    const h = this.handheld;
    const orbit = this.name === "title" ? Math.sin(t * 0.08) * 3.2 : 0;
    const sx = (Math.sin(t * 31.1) + Math.sin(t * 17.3)) * 0.5 * this.shakeAmt * 0.35;
    const sy = (Math.sin(t * 27.7) + Math.sin(t * 13.9)) * 0.5 * this.shakeAmt * 0.35;
    this.cam.position.set(
      this.pos.x + orbit + Math.sin(t * 0.37) * 0.09 * h + sx,
      this.pos.y + Math.sin(t * 0.51) * 0.06 * h + sy,
      this.pos.z + Math.cos(t * 0.29) * 0.08 * h,
    );
    const sw = this.sway;
    this.cam.lookAt(this.look.x + sx * 0.4 + Math.sin(t * 1.7) * sw, this.look.y + sy * 0.4 + Math.sin(t * 2.3 + 1) * sw * 0.6, this.look.z);
    if (Math.abs(this.cam.fov - this.fov) > 0.01) {
      this.cam.fov = this.fov;
      this.cam.updateProjectionMatrix();
    }
    if (this.titleGroup.visible) this.animateTitle(t);
  }

  buildTitle() {
    this.titleGroup = new THREE.Group();
    this.titleGroup.position.set(0, 10.6, -28);
    const l1 = word("DEAD &", { size: 3.2, depth: 1.2, material: this.titleMat });
    const l2 = word("INJURED", { size: 3.2, depth: 1.2, material: this.titleMat });
    l1.group.position.y = 2.05;
    l2.group.position.y = -2.05;
    this.titleGroup.add(l1.group, l2.group);
    this.titleLetters = [...l1.letters, ...l2.letters];
    this.titleLetters.forEach((m, i) => {
      m.userData.phase = i * 0.45;
      m.userData.drop = 1;
    });
    this.stage.scene.add(this.titleGroup);
  }

  animateTitle(t) {
    for (const m of this.titleLetters) {
      const h = m.userData.home;
      const d = m.userData.drop;
      m.position.y = h.y + Math.sin(t * 1.1 + m.userData.phase) * 0.12 + d * 16;
      m.rotation.x = Math.sin(t * 0.8 + m.userData.phase) * 0.05 - d * 1.2;
      m.rotation.z = d * (m.userData.phase % 1 - 0.5);
    }
  }

  // The letters fall out of the sky one by one, each landing with a thud.
  async titleIn() {
    this.titleGroup.visible = true;
    const order = this.titleLetters.map((m, i) => i);
    for (const [n, i] of order.entries()) {
      const m = this.titleLetters[i];
      gsap.to(m.userData, {
        drop: 0, duration: 0.85, delay: n * 0.085, ease: "bounce.out",
        onStart: () => gsap.delayedCall(0.36, () => this.sfx.play("title", { pan: (m.position.x / 12), n })),
      });
    }
    await wait(order.length * 0.085 + 0.7);
    this.shake(0.5);
    this.fx.explode(V(-14, groundHeight(-14, -40), -40), { size: 1.6, crater: false });
    this.sfx.play("impact", { far: 1, pan: -0.6 });
  }

  titleOut() {
    for (const [n, m] of this.titleLetters.entries()) gsap.to(m.userData, { drop: 1, duration: 0.6, delay: n * 0.03, ease: "power2.in" });
    return wait(0.9).then(() => (this.titleGroup.visible = false));
  }

  titleShow(on) {
    this.titleGroup.visible = on;
    for (const m of this.titleLetters) m.userData.drop = on ? 0 : 1;
  }

  // Ambient war on the horizon while the menu is up.
  distant() {
    const x = rnd(-40, 40);
    const z = rnd(-70, -40);
    const p = V(x, groundHeight(x, z), z);
    this.fx.explode(p, { size: rnd(0.9, 1.6), crater: false });
    this.sfx.play("impact", { far: 1, pan: x / 50 });
  }

  // ---- The supply draw -------------------------------------------------------------------

  buildRps() {
    return buildRps(this.stage.scene, SIDES);
  }

  rpsShow(on) {
    for (const side of ["me", "opp"]) {
      const r = this.rps[side];
      r.group.visible = on;
      r.fist.visible = on;
      for (const k of ["rock", "paper", "scissors"]) r[k].visible = false;
      const spread = this.stage.aspect < 0.9 ? 1.35 : 2.2;
      r.group.position.set(side === "me" ? -spread : spread, 4.4, -6.5);
      r.group.rotation.set(0, 0, 0);
      r.group.scale.setScalar(1);
    }
  }

  async rpsIdle() {
    await this.shot("supply", 1.1);
  }

  // Three beats of the fists, the reveal, then the winning hand takes the loser.
  async rpsClash({ me, opp, result }) {
    this.rpsShow(true);
    const R = this.rps;
    for (let beat = 0; beat < 3; beat++) {
      this.emit("rpsBeat", beat);
      this.sfx.play("drum", { n: beat });
      for (const side of ["me", "opp"]) {
        gsap.fromTo(R[side].group.position, { y: 4.4 }, { y: 5.1, duration: 0.17, yoyo: true, repeat: 1, ease: "power2.out" });
      }
      await wait(0.42);
    }
    this.emit("rpsBeat", 3);
    for (const [side, pick] of [["me", me], ["opp", opp]]) {
      const r = R[side];
      r.fist.visible = false;
      const o = r[pick];
      o.visible = true;
      o.scale.setScalar(0.01);
      gsap.to(o.scale, { x: 1, y: 1, z: 1, duration: 0.35, ease: "back.out(3)" });
    }
    this.sfx.play("pop");
    await wait(0.55);
    const meG = R.me.group;
    const oppG = R.opp.group;
    if (result === "draw") {
      gsap.to(meG.position, { x: -0.55, duration: 0.22, ease: "power2.in", yoyo: true, repeat: 1 });
      gsap.to(oppG.position, { x: 0.55, duration: 0.22, ease: "power2.in", yoyo: true, repeat: 1 });
      await wait(0.22);
      this.sfx.play("clash");
      this.shake(0.3);
      this.fx.explode(V(0, 4.4, -6.5), { size: 0.35, air: true });
      await wait(0.9);
    } else {
      const winner = result === "win" ? meG : oppG;
      const loser = result === "win" ? oppG : meG;
      gsap.to(winner.position, { x: loser.position.x * 0.35, duration: 0.24, ease: "power3.in" });
      gsap.to(winner.rotation, { z: winner === meG ? -0.5 : 0.5, duration: 0.24 });
      await wait(0.24);
      this.sfx.play("clash");
      this.sfx.play("shatter");
      this.shake(0.5);
      const side = result === "win" ? "opp" : "me";
      this.fx.explode(loser.position.clone(), { size: 0.5, air: true, chips: SIDES[side].clay });
      this.fx.spray(loser.position.clone(), 18, SIDES[side].clay, 6, 1.4);
      loser.visible = false;
      gsap.to(winner.rotation, { z: 0, y: Math.PI * 2, duration: 0.8, ease: "power2.out" });
      gsap.to(winner.position, { y: 5.2, duration: 0.5, ease: "power2.out" });
      await wait(1);
    }
    gsap.to([meG.scale, oppG.scale], { x: 0.01, y: 0.01, z: 0.01, duration: 0.3, ease: "power2.in" });
    await wait(0.32);
    this.rpsShow(false);
  }

  // ---- Deploying the code ----------------------------------------------------------------

  crate(on) {
    const g = this.codes.me.group;
    gsap.killTweensOf(g.position);
    if (on) {
      if (!g.visible) g.position.y = -2.2;
      g.visible = true;
      return new Promise((r) => gsap.to(g.position, { y: 0, duration: 0.9, ease: "power3.out", onComplete: r }));
    }
    if (!g.visible) return Promise.resolve();
    return new Promise((r) => gsap.to(g.position, { y: -2.2, duration: 0.8, ease: "power2.in", onComplete: () => { g.visible = false; r(); } }));
  }

  setCode(code, { side = "me", sound = true } = {}) {
    const cb = this.codes[side];
    const chars = (code || "").split("");
    for (let i = 0; i < 4; i++) {
      const ch = chars[i] || "";
      const had = cb.digits[i];
      if (ch === had) continue;
      const b = cb.blocks[i];
      gsap.killTweensOf(b.scale);
      gsap.killTweensOf(b.position);
      if (ch) {
        cb.set(i, ch);
        b.scale.setScalar(0.01);
        b.position.y = b.userData.home.y + 1.6;
        gsap.to(b.scale, { x: 1, y: 1, z: 1, duration: 0.3, ease: "back.out(2.4)" });
        gsap.to(b.position, { y: b.userData.home.y, duration: 0.38, ease: "bounce.out" });
        if (sound) this.sfx.play("clack", { n: i });
      } else {
        gsap.to(b.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.18, ease: "power2.in", onComplete: () => cb.set(i, "") });
      }
    }
  }

  async lockCode() {
    const cb = this.codes.me;
    for (const [i, b] of cb.blocks.entries()) {
      gsap.fromTo(b.position, { y: b.userData.home.y + 0.35 }, { y: b.userData.home.y, duration: 0.3, delay: i * 0.07, ease: "power4.in" });
    }
    await wait(0.3 + 0.21);
    this.sfx.play("lock");
    this.shake(0.25);
    this.fx.dust(V(0, 0.2, cb.group.position.z), 8, 0.9);
  }

  // ---- A volley ---------------------------------------------------------------------------

  // Plays one shot of the match: four digits leave the shooter's gun, burst over the target
  // squad, and the soldiers die, fall wounded or duck. Which soldier falls is random: nothing
  // on screen ties a digit to a result.
  async volley(v, { smokeUp = false } = {}) {
    const from = v.by;
    const to = other(from);
    const sd = SIDES[to];
    const cannon = this.world.cannons[from];
    const mine = from === "me";
    this.army.aim(from, true);
    cannon.target = 0.62;

    if (mine) this.shot("launch", 0.75);
    else if (this.name !== "home") this.shot("home", 0.6);
    await wait(mine ? 0.65 : 0.45);
    if (!mine) this.sfx.play("siren");

    if (v.miss) {
      const m = this.world.muzzle(from);
      this.fx.dust(m.pos, 6, 0.8);
      this.sfx.play("misfire", { far: mine ? 0.2 : 1 });
      await wait(1.1);
      this.emit("result", v);
      await wait(1.3);
      this.army.aim(from, false);
      cannon.target = 0.35;
      await this.shot("home", 0.8);
      return;
    }

    const digits = v.guess.split("");
    const bursts = shuffle([-3.2, -1.1, 1.1, 3.2]).map((x) => V(x + rnd(-0.4, 0.4), rnd(3.4, 4.3), sd.z + rnd(-0.6, 0.6)));
    const flights = [];
    for (let i = 0; i < 4; i++) {
      flights.push(wait(i * 0.19).then(() => this.launch(from, digits[i], bursts[i], i)));
    }
    await wait(0.4);
    if (mine) this.shot("enemyFront", 1.55, "power2.inOut");
    else {
      this.shot("sky", 1.0, "power2.inOut");
      wait(1.15).then(() => this.shot("homeFront", 0.4, "power2.out"));
    }
    await Promise.all(flights);

    const squad = this.army.squad(to);
    const hidden = mine && v.smoked;
    const order = shuffle(squad.slice());
    let outcome;
    if (v.hits != null) outcome = order.map((s, i) => (i < v.hits ? "hit" : "miss"));
    else outcome = order.map((s, i) => (i < v.dead ? "dead" : i < v.dead + v.injured ? "injured" : "miss"));
    let slowed = false;
    for (let i = 0; i < 4; i++) {
      const s = order[i];
      const o = outcome[i];
      await wait(rnd(0.12, 0.22));
      const at = s.pos.clone();
      const dir = V(rnd(-0.25, 0.25), 0, sd.dir).normalize();
      if (o === "dead") {
        if (!slowed && !hidden) {
          slowed = true;
          this.slowmo(0.33, 0.5);
        }
        this.fx.explode(at.clone().add(V(rnd(-0.3, 0.3), 0, sd.dir * 0.4)), { size: 0.75, chips: sd.clay });
        s.kill(dir, v.dead >= 3);
        this.shake(mine ? 0.55 : 0.85);
        this.sfx.play("impact", { pan: this.pan(at) });
        this.sfx.play("death", { pan: this.pan(at), n: s.i + (to === "opp" ? 4 : 0) });
        wait(0.35).then(() => this.sfx.play("toll", { n: i }));
        if (!mine) this.emit("hurt", 1);
      } else if (o === "injured") {
        this.fx.explode(at.clone().add(V(rnd(-1, 1), 0, -sd.dir * 1.1)), { size: 0.45 });
        s.wound();
        this.shake(0.35);
        this.sfx.play("ricochet", { pan: this.pan(at) });
        this.sfx.play("injured", { pan: this.pan(at), n: s.i });
        if (!mine) this.emit("hurt", 0.45);
      } else if (o === "hit") {
        this.fx.explode(at.clone().add(V(rnd(-0.6, 0.6), 0, sd.dir * 0.3)), { size: 0.6 });
        this.sfx.play("impact", { pan: this.pan(at) });
        this.shake(0.4);
      } else {
        const miss = at.clone().add(V(rnd(-1.4, 1.4), 0, -sd.dir * rnd(2.5, 5)));
        miss.y = groundHeight(miss.x, miss.z);
        this.fx.explode(miss, { size: 0.55 });
        this.sfx.play("impact", { pan: this.pan(miss), far: 0.4 });
        s.duck();
      }
    }
    await wait(0.7);
    this.emit("result", v);
    await wait(1.4);
    this.army.aim(from, false);
    cannon.target = 0.35;
    if (v.dead === 4) return;
    await this.shot("home", 0.9);
    this.reinforce(to);
    await wait(0.4);
  }

  reinforce(side) {
    for (const s of this.army.squad(side)) s.sink();
    const n = this.army.squad(side).filter((s) => !s.alive).length;
    if (n) {
      wait(0.5).then(() => {
        this.army.reinforce(side);
        this.sfx.play("reinforce", { n });
      });
    } else this.army.reinforce(side);
  }

  launch(from, ch, target, i) {
    const m = this.world.muzzle(from);
    const cannon = this.world.cannons[from];
    cannon.recoil = 1;
    this.fx.muzzle(m.pos, m.dir);
    this.sfx.play("boom", { far: from === "me" ? 0 : 1, n: i, pan: from === "me" ? 0.5 : 0.3 });
    if (from === "me") this.shake(0.3);
    const shell = this.shells[i];
    shell.geometry = glyph(ch, 0.95, 0.3);
    shell.visible = true;
    const p0 = m.pos.clone();
    const p2 = target;
    const p1 = p0.clone().lerp(p2, 0.5).add(V(0, 11 + rnd(-1, 1.5), 0));
    const state = { t: 0 };
    const dur = 1.55 + i * 0.03;
    let acc = 0;
    let whistled = false;
    return new Promise((done) => {
      gsap.to(state, {
        t: 1, duration: dur, ease: "none",
        onUpdate: () => {
          const t = state.t;
          const a = p0.clone().multiplyScalar((1 - t) * (1 - t));
          const b = p1.clone().multiplyScalar(2 * (1 - t) * t);
          const c = p2.clone().multiplyScalar(t * t);
          const pos = a.add(b).add(c);
          shell.position.copy(pos);
          shell.lookAt(this.cam.position);
          shell.rotation.z += 0.12;
          const sc = 0.55 + Math.sin(t * Math.PI) * 0.5;
          shell.scale.setScalar(sc);
          acc += 1;
          if (acc % 2 === 0) this.fx.trail(pos, 0.9);
          if (!whistled && t > 0.28) {
            whistled = true;
            this.sfx.play("whistle", { incoming: from !== "me", dur: dur * 0.72, n: i });
          }
        },
        onComplete: () => {
          shell.visible = false;
          this.fx.explode(p2.clone(), { size: 0.75, air: true });
          this.sfx.play("burst", { pan: this.pan(p2), n: i });
          this.shake(from === "me" ? 0.3 : 0.6);
          done();
        },
      });
    });
  }

  // ---- Endings ---------------------------------------------------------------------------

  wordFor(text) {
    if (!this.words[text]) {
      const w = word(text, { size: 2.2, depth: 0.9, material: this.titleMat });
      w.group.visible = false;
      w.group.position.set(0, 8.5, -30);
      this.stage.scene.add(w.group);
      this.words[text] = w;
    }
    return this.words[text];
  }

  prebuildWords() {
    for (const t of ["CRACKED", "OVERRUN", "STALEMATE", "VICTORY", "FORFEIT", "TIME"]) this.wordFor(t);
  }

  hideWords() {
    for (const w of Object.values(this.words)) w.group.visible = false;
  }

  async ending({ winner, reason, codes }) {
    const text = winner === "draw" ? "STALEMATE" : reason === "time" && winner !== "none" ? "TIME" : winner === "me" ? (reason === "cracked" ? "CRACKED" : "VICTORY") : winner === "opp" ? (reason === "cracked" ? "OVERRUN" : "FORFEIT") : null;
    if (winner === "me" || winner === "draw") gsap.to(this.world.flags.opp, { lower: winner === "draw" ? 0.5 : 1, duration: 2.2, ease: "power2.inOut" });
    if (winner === "opp" || winner === "draw") gsap.to(this.world.flags.me, { lower: winner === "draw" ? 0.5 : 1, duration: 2.2, ease: "power2.inOut" });
    if (winner === "me") for (const s of this.army.squad("me")) wait(rnd(0, 0.4)).then(() => s.cheer());
    if (winner === "opp") for (const s of this.army.squad("opp")) wait(rnd(0, 0.4)).then(() => s.cheer());

    if (codes?.opp) {
      const cb = this.codes.opp;
      cb.group.visible = true;
      cb.group.position.y = -2.4;
      this.setCode(codes.opp, { side: "opp", sound: false });
      await this.shot("reveal", 1.4);
      gsap.to(cb.group.position, { y: 0, duration: 1.2, ease: "power3.out" });
      this.sfx.play("rumble");
      this.fx.dust(V(0, 0.2, cb.group.position.z), 10, 1.4);
      await wait(1.3);
    }
    if (text) {
      const w = this.wordFor(text);
      w.group.visible = true;
      for (const [i, m] of w.letters.entries()) {
        m.position.y = m.userData.home.y + 14;
        m.rotation.x = -1.2;
        gsap.to(m.position, { y: m.userData.home.y, duration: 0.8, delay: i * 0.06, ease: "bounce.out" });
        gsap.to(m.rotation, { x: 0, duration: 0.8, delay: i * 0.06, ease: "power2.out" });
      }
    }
    await this.shot("far", 2.2);
  }

  resetField() {
    this.hideWords();
    this.world.flags.me.lower = 0;
    this.world.flags.opp.lower = 0;
    this.codes.opp.group.visible = false;
    this.codes.opp.group.position.y = -2.4;
    this.setCode("", { side: "opp", sound: false });
    this.setCode("", { sound: false });
    this.codes.me.group.visible = false;
    this.army.reset();
    this.army.hidden.opp = false;
    this.army.hidden.me = false;
    for (const side of ["me", "opp"]) this.smoke(side, false);
  }

  smoke(side, on) {
    this.fx.screen(V(0, 0, SIDES[side].z), on);
  }

  // ---- Supplies ---------------------------------------------------------------------------

  // Your sniper: through the scope onto the soldier standing in that spot of their line. A hit
  // takes his helmet; a miss chews the sandbags and he lets you know about it.
  async sniper({ by, spot, hit }) {
    if (by !== "me") return this.sniped();
    const target = this.army.squad("opp")[spot];
    const shooter = this.army.squad("me").filter((s) => s.alive).sort((a, b) => Math.abs(a.home.x - target.home.x) - Math.abs(b.home.x - target.home.x))[0];
    shooter?.aim(true);
    const aimAt = target.above(V(), 0.05);
    const eye = V(target.home.x * 0.35, 2.9, 8.6);
    // Frame about 2.7 units of him inside the scope's circle, however big the circle is here.
    const circle = Math.min(innerWidth * 0.88, innerHeight * 0.72) / innerHeight;
    const fov = THREE.MathUtils.radToDeg(2 * Math.atan(1.35 / circle / eye.distanceTo(aimAt)));
    this.stage.setInset(0, 0);
    this.emit("scope", { on: true, spot });
    this.sfx.play("aim");
    await this.move(eye, aimAt, fov, 1.1, "power3.inOut");
    gsap.fromTo(this, { sway: 0.1 }, { sway: 0.008, duration: 1.3, ease: "power2.out" });
    await wait(1.2);
    this.sfx.play("sniper");
    await wait(0.36);
    this.emit("scope", { kick: true });
    this.shake(0.3);
    await wait(0.06);
    if (hit) {
      target.shot(V(rnd(-0.3, 0.3), 0, -1));
      this.fx.spray(target.above(V(), 0), 8, 0x6b6f76, 3.5, 0.45);
      this.sfx.play("impact", { far: 0.55 });
      await wait(1.5);
    } else {
      const side = Math.random() < 0.5 ? -1 : 1;
      const puff = V(target.home.x + side * rnd(0.35, 0.7), rnd(0.45, 0.75), target.home.z + 1.25);
      this.fx.dust(puff, 6, 0.55);
      this.fx.spray(puff, 6, 0x75664a, 2.5, 0.5);
      this.sfx.play("ricochet", { far: 0.5, pan: side * 0.3 });
      await wait(0.45);
      target.taunt();
      this.emit("say", { soldier: target, text: ["Missed me!", "Is that all?", "Try again!", "Not even close"][Math.floor(rnd(0, 4))], ms: 2200 });
      this.sfx.play("taunt", { id: 2, far: 0.55 });
      await wait(1.9);
    }
    this.emit("scope", { on: false });
    this.sway = 0;
    shooter?.aim(false);
    await this.shot("home", 1.0);
  }

  // Their sniper: a glint on their line, a crack, dirt kicked up beside one of yours.
  async sniped() {
    const pick = (list) => list[Math.floor(Math.random() * list.length)];
    const shooter = pick(this.army.squad("opp").filter((s) => s.alive));
    const victim = pick(this.army.squad("me").filter((s) => s.alive));
    if (shooter) {
      const at = shooter.above(V(), -0.15).add(V(0, 0, 0.35));
      for (const d of [0, 0.5]) this.fx.fire.spawn({ pos: at, s0: 0.2, s1: 1.1, c0: new THREE.Color(0xffffff), c1: new THREE.Color(0xfff2c0), a0: 1, a1: 0, life: 0.3, delay: d });
    }
    this.sfx.play("sniper", { far: 0.45 });
    await wait(0.62);
    if (victim) {
      this.fx.dust(victim.home.clone().add(V(rnd(-0.6, 0.6), 0.5, -1.2)), 6, 0.6);
      this.sfx.play("ricochet", { pan: this.pan(victim.pos) });
      victim.flinch();
    }
    this.shake(0.2);
    await wait(1.2);
  }

  // Recon: a spotter plane crosses their trench, photographs the code crate and drops a flare,
  // green if the digit is in their code and red if not. Theirs crosses yours and learns in secret.
  async recon({ by, found }) {
    const mine = by === "me";
    const plane = this.planes[mine ? "me" : "opp"];
    // Theirs flies low enough to cross the top of the home shot as it buzzes your line.
    const a = mine ? V(-52, 11.5, -13) : V(46, 7.4, 15);
    const b = mine ? V(52, 10.5, -29) : V(-46, 6.8, -1);
    const crate = mine ? V(0, 0, SIDES.opp.z + SIDES.opp.dir * 4.2) : V(0, 0, SIDES.me.z + SIDES.me.dir * 4.2);
    const dur = 3.8;
    const dirV = b.clone().sub(a).normalize();
    if (mine) {
      this.stage.setInset(0, 0);
      await this.move(V(-4, 2.4, -7), V(-30, 10.5, -16), 56, 0.8);
      this.follow = plane;
    } else wait(dur * 0.36).then(() => { for (const s of this.army.squad("me")) wait(rnd(0, 0.2)).then(() => s.duck()); });
    plane.visible = true;
    plane.position.copy(a);
    this.sfx.play("plane", { dur: dur + 0.4 });
    let snapped = false;
    let flare = null;
    let burning = null;
    const st = { t: 0 };
    const prop = plane.userData.prop;
    const beam = this.beam;
    await new Promise((done) => gsap.to(st, {
      t: 1, duration: dur, ease: "none", onComplete: done,
      onUpdate: () => {
        const p = a.clone().lerp(b, st.t);
        p.y -= Math.sin(st.t * Math.PI) * 1.4;
        plane.position.copy(p);
        plane.lookAt(p.clone().add(dirV));
        plane.rotateZ(Math.sin(st.t * Math.PI * 2) * 0.14);
        prop.rotation.z += 0.9;
        const over = Math.abs(p.x - crate.x);
        if (over < 6) {
          beam.visible = true;
          beam.position.copy(p);
          beam.scale.set(1, p.y - 0.2, 1);
          beam.material.opacity = 0.32 * Math.max(0, 1 - over / 6);
          if (!snapped && over < 1.2) {
            snapped = true;
            this.fx.fire.spawn({ pos: p, s0: 2.5, s1: 6, c0: new THREE.Color(0xffffff), c1: new THREE.Color(0xfff4d8), a0: 1, a1: 0, life: 0.22 });
            this.fx.flashLight(crate.clone().setY(1), 0.6);
            this.sfx.play("shutter");
          }
        } else beam.visible = false;
        if (mine && !flare && p.x > crate.x + 3) {
          flare = { pos: p.clone().add(V(0, -0.6, 0)), vel: dirV.clone().multiplyScalar(6).setY(-1), color: new THREE.Color(found ? 0x74ff8a : 0xff5a3c) };
          this.sfx.play("flare");
          burning = this.burnFlare(flare, found);
        }
      },
    }));
    beam.visible = false;
    plane.visible = false;
    await burning;
    this.follow = null;
    if (mine) await this.shot("home", 1.0);
    else await wait(0.4);
  }

  // A parachute flare drifting down, lighting the field in its colour.
  burnFlare(f, found) {
    const light = this.world.flash;
    const base = light.color.getHex();
    light.color.setHex(found ? 0x5cff78 : 0xff4630);
    this.follow = { position: f.pos };
    gsap.to(this, { fov: 30, duration: 1.6, ease: "power2.out" });
    const st = { t: 0 };
    let last = 0;
    return new Promise((done) => gsap.to(st, {
      t: 2.4, duration: 2.4, ease: "none",
      onUpdate: () => {
        const dt = st.t - last;
        last = st.t;
        f.vel.multiplyScalar(Math.exp(-dt * 2.2));
        f.vel.y = Math.max(f.vel.y - dt * 0.6, -1.3);
        f.pos.addScaledVector(f.vel, dt);
        this.fx.fire.spawn({ pos: f.pos, s0: 2.4, s1: 0.6, c0: f.color, c1: f.color, a0: 1, a1: 0, life: 0.18 });
        this.fx.smoke.spawn({ pos: f.pos.clone(), vel: V(0, 0.4, 0), s0: 0.3, s1: 1.2, c0: new THREE.Color(0x8a8078), c1: new THREE.Color(0xb0a89e), a0: 0.35, a1: 0, life: 1.6, drag: 1 });
        light.position.copy(f.pos);
        light.intensity = 26 * (0.85 + Math.sin(st.t * 40) * 0.15);
      },
      onComplete: () => {
        light.color.setHex(base);
        done();
      },
    }));
  }
}
