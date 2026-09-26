import * as THREE from "three";
import { merge as mergeGeometries } from "./merge.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { SIDES, groundHeight } from "./palette.js";

const N = 8;
const GRAVITY = 15;
const BAND = { me: 0xd8432a, opp: 0xf3eee4 };

function geometries() {
  return {
    helmet: mergeGeometries([
      new THREE.SphereGeometry(0.205, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.84, 1.06),
      new THREE.CylinderGeometry(0.25, 0.255, 0.03, 22),
    ]),
    head: new THREE.SphereGeometry(0.145, 16, 12),
    torso: new THREE.CapsuleGeometry(0.19, 0.24, 4, 12).scale(1, 1, 0.8),
    pelvis: new THREE.CapsuleGeometry(0.15, 0.1, 4, 10).rotateZ(Math.PI / 2).scale(1, 1, 0.84),
    pack: new RoundedBoxGeometry(0.34, 0.38, 0.17, 2, 0.05),
    leg: mergeGeometries([
      new THREE.CapsuleGeometry(0.086, 0.54, 4, 10).translate(0, -0.37, 0),
      new RoundedBoxGeometry(0.15, 0.1, 0.27, 2, 0.035).translate(0, -0.8, 0.05),
    ]),
    arm: mergeGeometries([
      new THREE.CapsuleGeometry(0.066, 0.4, 4, 10).translate(0, -0.27, 0),
      new THREE.SphereGeometry(0.07, 10, 8).translate(0, -0.52, 0),
    ]),
    rifle: mergeGeometries([
      new THREE.BoxGeometry(0.075, 0.12, 0.3).translate(0, -0.03, -0.36),
      new THREE.BoxGeometry(0.062, 0.085, 0.46).translate(0, 0.005, -0.02),
      new THREE.CylinderGeometry(0.019, 0.019, 0.56, 6).rotateX(Math.PI / 2).translate(0, 0.03, 0.47),
    ]),
    band: new THREE.TorusGeometry(0.155, 0.036, 6, 18).rotateX(Math.PI / 2),
  };
}

const POSES = {
  carry: { armL: [-0.95, 0.5], armR: [-0.45, -0.3], rifle: [0.08, 0.02, 0.22, -1.2, 0, 0.62] },
  aim: { armL: [-1.42, 0.42], armR: [-1.25, -0.2], rifle: [0.1, 0.36, 0.3, -0.02, 0, 0] },
};

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();

function local(out, parent, x, y, z, rx = 0, ry = 0, rz = 0, order = "XYZ", s = 1) {
  tmpE.set(rx, ry, rz, order);
  tmpQ.setFromEuler(tmpE);
  tmpV.set(x, y, z);
  tmpS.set(s, s, s);
  tmpM.compose(tmpV, tmpQ, tmpS);
  return out.multiplyMatrices(parent, tmpM);
}

const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const rand = (a, b) => a + Math.random() * (b - a);

class Loose {
  constructor() {
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.rot = new THREE.Euler();
    this.spin = new THREE.Vector3();
    this.on = true;
    this.rest = false;
  }

  launch(from, vel, spin) {
    this.on = false;
    this.rest = false;
    this.pos.copy(from);
    this.vel.copy(vel);
    this.spin.copy(spin);
    this.rot.set(0, 0, 0);
  }

  update(dt, lift, flip) {
    if (this.on || this.rest) return;
    this.vel.y -= GRAVITY * dt;
    this.pos.addScaledVector(this.vel, dt);
    this.rot.x += this.spin.x * dt;
    this.rot.y += this.spin.y * dt;
    this.rot.z += this.spin.z * dt;
    const g = groundHeight(this.pos.x, this.pos.z) + lift;
    if (this.pos.y < g) {
      this.pos.y = g;
      if (this.vel.y < -2) {
        this.vel.y *= -0.35;
        this.vel.x *= 0.5;
        this.vel.z *= 0.5;
        this.spin.multiplyScalar(0.5);
      } else {
        this.rest = true;
        this.rot.x = flip;
        this.rot.z = 0;
      }
    }
  }
}

class Soldier {
  constructor(army, side, i) {
    this.army = army;
    this.side = side;
    this.sd = SIDES[side];
    this.i = i;
    this.home = new THREE.Vector3(-3 + i * 2, 0, this.sd.z);
    this.pos = this.home.clone();
    this.vel = new THREE.Vector3();
    this.yaw = this.sd.face;
    this.fall = 0;
    this.roll = 0;
    this.fallVel = 0;
    this.rollVel = 0;
    this.spinVel = 0;
    this.state = "idle";
    this.t = 0;
    this.phase = Math.random() * 20;
    this.p = { crouch: 0, lean: 0, twist: 0, hx: 0, hy: 0, aLx: -0.95, aLz: 0.5, aRx: -0.45, aRz: -0.3, lLx: 0, lRx: 0, lLz: 0, lRz: 0, aim: 0, lift: 0 };
    this.flash = 0;
    this.band = 0;
    this.scale = 1;
    this.aiming = false;
    this.helmet = new Loose();
    this.rifle = new Loose();
    this.landed = false;
    this.bounces = 0;
    this.look = 0;
    this.lookT = rand(1, 4);
  }

  get alive() {
    return this.state !== "dead" && this.state !== "sink" && this.state !== "gone";
  }

  set(state) {
    this.state = state;
    this.t = 0;
  }

  aim(on) {
    this.aiming = on;
  }

  duck() {
    if (this.alive) this.set("duck");
  }

  wound() {
    if (!this.alive) return;
    this.set("wounded");
    this.flash = 1;
    this.vel.set(0, 0, 0);
  }

  cheer() {
    if (this.alive) this.set(this.state === "wounded" ? "wounded" : "cheer");
  }

  salute() {
    if (this.alive && this.state === "idle") this.set("salute");
  }

  kill(dir, big = false) {
    if (!this.alive) return;
    this.set("dead");
    this.flash = 1;
    this.landed = false;
    this.bounces = 0;
    const launch = big || Math.random() < 0.45;
    const push = launch ? rand(2.6, 3.6) : rand(1.4, 2.1);
    this.vel.set(dir.x * push + rand(-0.6, 0.6), launch ? rand(5.2, 7) : rand(1.4, 2.2), dir.z * push);
    this.fallVel = -(launch ? rand(4.5, 7) : rand(2.8, 3.8));
    this.rollVel = rand(-1, 1) * (launch ? 3 : 1);
    this.spinVel = rand(-1, 1) * (launch ? 4 : 0.8);
    const head = this.worldPoint(0, 1.7, 0);
    this.helmet.launch(head, new THREE.Vector3(dir.x * 1.5 + rand(-1.2, 1.2), rand(4.5, 6.5), dir.z * 1.5 + rand(-0.8, 0.8)), new THREE.Vector3(rand(-9, 9), rand(-6, 6), rand(-9, 9)));
    const hand = this.worldPoint(0.2, 1.2, 0.3);
    this.rifle.launch(hand, new THREE.Vector3(dir.x * 1.2 + rand(-1.5, 1.5), rand(3, 5), dir.z * 1.2 + rand(-1, 1)), new THREE.Vector3(rand(-6, 6), rand(-8, 8), rand(-6, 6)));
  }

  sink() {
    if (this.state === "dead") this.set("sink");
  }

  respawn(delay = 0) {
    this.set("rise");
    this.t = -delay;
    this.fall = this.roll = 0;
    this.fallVel = this.rollVel = this.spinVel = 0;
    this.yaw = this.sd.face;
    this.helmet.on = true;
    this.rifle.on = true;
    this.band = 0;
    this.flash = 0;
    this.scale = 1;
    this.pos.set(this.home.x, -1.4, this.home.z + this.sd.dir * 2.5);
  }

  heal() {
    if (this.state === "wounded") this.set("idle");
  }

  worldPoint(x, y, z) {
    const v = new THREE.Vector3(x, y, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    return v.add(this.pos);
  }

  update(dt, time) {
    this.t += dt;
    const p = this.p;
    const T = { crouch: 0, lean: 0.04, twist: 0, hx: 0, hy: 0, lLx: 0, lRx: 0, lLz: 0.02, lRz: -0.02, aim: this.aiming ? 1 : 0, lift: 0 };
    let k = 10;
    const breathe = Math.sin(time * 1.7 + this.phase) * 0.018;
    this.flash = Math.max(0, this.flash - dt * 3.2);

    this.lookT -= dt;
    if (this.lookT < 0) {
      this.lookT = rand(1.5, 5);
      this.look = rand(-0.5, 0.5);
    }

    switch (this.state) {
      case "idle":
        T.hy = this.look;
        T.lean += breathe;
        break;
      case "duck": {
        const on = this.t < 0.55;
        T.crouch = on ? 1 : 0;
        T.lean = on ? 0.7 : 0.04;
        T.hx = on ? 0.45 : 0;
        T.lLx = on ? -0.9 : 0;
        T.lRx = on ? 0.55 : 0;
        T.aim = 0;
        k = on ? 22 : 8;
        if (this.t > 1.1) this.set("idle");
        break;
      }
      case "wounded": {
        const stagger = Math.max(0, 1 - this.t * 2.5);
        T.crouch = 0.45 + stagger * 0.2;
        T.lean = 0.5 + Math.sin(time * 9 + this.phase) * 0.02;
        T.hx = 0.35;
        T.lLx = -0.55;
        T.lRx = 0.35;
        T.aim = 0;
        this.band = damp(this.band, 1, 9, dt);
        const back = stagger * 0.45 * this.sd.dir * dt * 3;
        this.pos.z += back;
        this.pos.z = damp(this.pos.z, this.home.z, 1.5, dt);
        break;
      }
      case "cheer":
        T.aim = 0;
        T.lift = Math.abs(Math.sin(this.t * 7 + this.phase)) * 0.35;
        T.hx = -0.3;
        if (this.t > 3.5) this.set("idle");
        break;
      case "salute":
        T.aim = 0;
        if (this.t > 1.6) this.set("idle");
        break;
      case "rise": {
        if (this.t < 0) {
          this.scale = 0;
          break;
        }
        this.scale = 1;
        const u = Math.min(1, this.t / 0.75);
        const from = this.home.z + this.sd.dir * 2.5;
        this.pos.x = this.home.x;
        this.pos.z = from + (this.home.z - from) * u;
        this.pos.y = -1.4 * (1 - u) + Math.sin(u * Math.PI) * 0.9;
        T.crouch = (1 - u) * 0.6;
        T.lean = (1 - u) * 0.5;
        T.aim = 0;
        k = 30;
        if (u >= 1) {
          this.pos.copy(this.home);
          this.set("idle");
          this.army.emit("risen", this);
        }
        break;
      }
      case "dead":
      case "sink":
        this.updateBody(dt);
        break;
    }

    if (this.state === "dead" || this.state === "sink") {
      const flail = this.landed ? 0 : 1;
      T.aim = 0;
      T.lLz = this.landed ? 0.22 : Math.sin(time * 14 + this.phase) * 0.5;
      T.lRz = this.landed ? -0.22 : -Math.sin(time * 13 + this.phase) * 0.5;
      T.lLx = flail * Math.sin(time * 11) * 0.6;
      T.lRx = -flail * Math.sin(time * 12) * 0.6;
      T.hx = this.landed ? -0.3 : 0.4;
      k = this.landed ? 6 : 14;
    }

    for (const key of Object.keys(T)) p[key] = damp(p[key], T[key], key === "aim" ? 7 : k, dt);

    const carry = POSES.carry;
    const aimP = POSES.aim;
    let aLx = carry.armL[0] + (aimP.armL[0] - carry.armL[0]) * p.aim;
    let aLz = carry.armL[1] + (aimP.armL[1] - carry.armL[1]) * p.aim;
    let aRx = carry.armR[0] + (aimP.armR[0] - carry.armR[0]) * p.aim;
    let aRz = carry.armR[1] + (aimP.armR[1] - carry.armR[1]) * p.aim;
    if (this.state === "duck" && this.t < 0.55) {
      aLx = -2.5; aLz = 0.55; aRx = -2.5; aRz = -0.55;
    } else if (this.state === "wounded") {
      aLx = -1.05; aLz = 0.95; aRx = -0.25; aRz = -0.08;
    } else if (this.state === "cheer") {
      const w = Math.sin(this.t * 7 + this.phase);
      aLx = -2.85 - w * 0.2; aLz = -0.35; aRx = -2.85 + w * 0.2; aRz = 0.35;
    } else if (this.state === "salute") {
      aRx = -2.1; aRz = -1.05;
    } else if (this.state === "dead" || this.state === "sink") {
      if (this.landed) {
        aLx = -0.3; aLz = -1.35; aRx = -0.3; aRz = 1.35;
      } else {
        aLx = -2.2 + Math.sin(time * 15 + this.phase) * 0.8; aLz = -0.6; aRx = -2.4 + Math.sin(time * 13) * 0.8; aRz = 0.6;
      }
    }
    const ak = this.state === "dead" ? 12 : 11;
    p.aLx = damp(p.aLx, aLx, ak, dt);
    p.aLz = damp(p.aLz, aLz, ak, dt);
    p.aRx = damp(p.aRx, aRx, ak, dt);
    p.aRz = damp(p.aRz, aRz, ak, dt);

    this.helmet.update(dt, 0.02, Math.PI);
    this.rifle.update(dt, 0.04, Math.PI / 2);
  }

  updateBody(dt) {
    if (this.state === "sink") {
      this.pos.y -= dt * 1.1;
      this.scale = Math.max(0, 1 - this.t * 1.3);
      if (this.scale <= 0) this.set("gone");
      return;
    }
    const sign = Math.sign(this.fallVel || -1);
    this.vel.y -= GRAVITY * dt;
    this.pos.addScaledVector(this.vel, dt);
    this.yaw += this.spinVel * dt;
    this.roll += this.rollVel * dt;
    this.fall += this.fallVel * dt;
    if (Math.abs(this.fall) >= Math.PI / 2) {
      this.fall = (Math.PI / 2) * sign;
      this.fallVel = 0;
    }
    const lying = Math.abs(Math.sin(this.fall));
    const rest = groundHeight(this.pos.x, this.pos.z) + lying * (this.fall < 0 ? 0.26 : 0.19);
    if (this.pos.y <= rest) {
      this.pos.y = rest;
      if (this.vel.y < -1.6 && this.bounces < 2) {
        this.bounces++;
        this.vel.y *= -0.3;
        this.vel.x *= 0.5;
        this.vel.z *= 0.5;
        this.spinVel *= 0.4;
        this.rollVel *= 0.4;
        if (!this.landed) {
          this.landed = true;
          this.army.emit("landed", this);
        }
      } else {
        this.vel.set(0, 0, 0);
        this.spinVel = 0;
        this.rollVel *= Math.exp(-dt * 8);
        this.roll *= Math.exp(-dt * 4);
        if (Math.abs(this.fall) < Math.PI / 2) this.fallVel = sign * Math.max(Math.abs(this.fallVel), 4) + sign * dt * 30;
        if (!this.landed) {
          this.landed = true;
          this.army.emit("landed", this);
        }
      }
    }
  }
}

export class Army {
  constructor(stage) {
    this.stage = stage;
    this.listeners = {};
    const g = geometries();
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.58, metalness: 0 });
    const make = (geo, count) => {
      const m = new THREE.InstancedMesh(geo, mat, count);
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      stage.scene.add(m);
      return m;
    };
    this.mesh = {
      helmet: make(g.helmet, N), head: make(g.head, N), torso: make(g.torso, N), pelvis: make(g.pelvis, N),
      pack: make(g.pack, N), leg: make(g.leg, N * 2), arm: make(g.arm, N * 2), rifle: make(g.rifle, N), band: make(g.band, N),
    };
    this.soldiers = [];
    for (const side of ["me", "opp"]) for (let i = 0; i < 4; i++) this.soldiers.push(new Soldier(this, side, i));
    this.squads = { me: this.soldiers.slice(0, 4), opp: this.soldiers.slice(4) };

    const shadowTex = (() => {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const x = c.getContext("2d");
      const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, "rgba(0,0,0,0.55)");
      gr.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = gr;
      x.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    this.shadows = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, color: 0x000000, polygonOffset: true, polygonOffsetFactor: -2 }),
      N,
    );
    this.shadows.frustumCulled = false;
    stage.scene.add(this.shadows);

    this.colors = { me: new THREE.Color(SIDES.me.clay), opp: new THREE.Color(SIDES.opp.clay) };
    this.white = new THREE.Color(0xfff4e0);
    this.c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const s = this.soldiers[i];
      this.mesh.band.setColorAt(i, new THREE.Color(BAND[s.side]));
    }
    this.frames = Array.from({ length: 12 }, () => new THREE.Matrix4());
    this.hidden = { me: false, opp: false };
    stage.hooks.push((dt, time) => this.update(dt, time));
    this.update(0, 0);
  }

  on(name, fn) {
    (this.listeners[name] ||= []).push(fn);
  }

  emit(name, s) {
    for (const fn of this.listeners[name] || []) fn(s);
  }

  update(dt, time) {
    const m = this.mesh;
    const [root, waist, torso, head, tmp, zero] = this.frames;
    zero.makeScale(0, 0, 0);
    const at = this.at || (this.at = new THREE.Vector3());
    const size = this.size || (this.size = new THREE.Vector3());
    for (let i = 0; i < N; i++) {
      const s = this.soldiers[i];
      s.update(dt, time);
      const p = s.p;
      const hide = this.hidden[s.side] || s.state === "gone";
      const sc = hide ? 0 : s.scale;
      tmpE.set(s.fall, 0, s.roll, "XYZ");
      const lift = p.lift;
      tmpM.makeRotationY(s.yaw);
      root.makeTranslation(s.pos.x, s.pos.y + lift, s.pos.z).multiply(tmpM);
      tmpQ.setFromEuler(tmpE);
      tmpM.compose(tmpV.set(0, 0, 0), tmpQ, tmpS.set(sc, sc, sc));
      root.multiply(tmpM);

      const hip = 0.92 - p.crouch * 0.36;
      local(waist, root, 0, hip + 0.06, 0, p.lean, p.twist, 0);
      local(torso, waist, 0, 0.26, 0);
      m.torso.setMatrixAt(i, torso);
      m.pelvis.setMatrixAt(i, local(tmp, root, 0, hip + 0.03, 0, p.lean * 0.3, 0, 0));
      m.pack.setMatrixAt(i, local(tmp, waist, 0, 0.3, -0.21));
      local(head, waist, 0, 0.62, 0.015, p.hx, p.hy, 0);
      m.head.setMatrixAt(i, head);
      m.band.setMatrixAt(i, s.band > 0.01 ? local(tmp, head, 0, 0.02, 0, 0, 0, 0, "XYZ", s.band) : zero);

      if (s.helmet.on) m.helmet.setMatrixAt(i, local(tmp, head, 0, 0.06, 0));
      else {
        const h = s.helmet;
        tmpQ.setFromEuler(h.rot);
        m.helmet.setMatrixAt(i, tmp.compose(h.pos, tmpQ, tmpS.set(sc, sc, sc)));
      }

      m.arm.setMatrixAt(i * 2, local(tmp, waist, -0.255, 0.44, 0, p.aLx, 0, p.aLz));
      m.arm.setMatrixAt(i * 2 + 1, local(tmp, waist, 0.255, 0.44, 0, p.aRx, 0, p.aRz));
      m.leg.setMatrixAt(i * 2, local(tmp, root, -0.1, hip, 0, p.lLx, 0, p.lLz));
      m.leg.setMatrixAt(i * 2 + 1, local(tmp, root, 0.1, hip, 0, p.lRx, 0, p.lRz));

      if (s.rifle.on) {
        const a = POSES.carry.rifle;
        const b = POSES.aim.rifle;
        const t = p.aim;
        const r = a.map((v, j) => v + (b[j] - v) * t);
        m.rifle.setMatrixAt(i, local(tmp, waist, r[0], r[1], r[2], r[3], r[4], r[5], "ZYX"));
      } else {
        const rl = s.rifle;
        tmpQ.setFromEuler(rl.rot);
        m.rifle.setMatrixAt(i, tmp.compose(rl.pos, tmpQ, tmpS.set(sc, sc, sc)));
      }

      this.c.copy(this.colors[s.side]);
      if (s.state === "dead" || s.state === "sink") this.c.multiplyScalar(0.72);
      if (s.flash > 0) this.c.lerp(this.white, Math.min(1, s.flash * 1.4));
      for (const key of ["helmet", "head", "torso", "pelvis", "pack", "rifle"]) m[key].setColorAt(i, this.c);
      m.arm.setColorAt(i * 2, this.c);
      m.arm.setColorAt(i * 2 + 1, this.c);
      m.leg.setColorAt(i * 2, this.c);
      m.leg.setColorAt(i * 2 + 1, this.c);

      const gy = groundHeight(s.pos.x, s.pos.z) + 0.02;
      const air = Math.max(0, s.pos.y + lift - gy);
      const lying = Math.abs(Math.sin(s.fall));
      const w = (0.9 + lying * 0.4) * sc * Math.max(0.3, 1 - air * 0.3);
      tmpQ.setFromAxisAngle(tmpV.set(0, 1, 0), s.yaw);
      const off = tmpS.set(0, 0, Math.sign(s.fall) * lying * 0.8).applyQuaternion(tmpQ);
      tmp.compose(at.set(s.pos.x + off.x, gy, s.pos.z + off.z), tmpQ, size.set(w, 1, w * (1 + lying * 1.4)));
      this.shadows.setMatrixAt(i, tmp);
    }
    for (const mesh of Object.values(m)) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.shadows.instanceMatrix.needsUpdate = true;
  }

  squad(side) {
    return this.squads[side];
  }

  aim(side, on) {
    for (const s of this.squads[side]) s.aim(on);
  }

  reinforce(side) {
    let n = 0;
    for (const s of this.squads[side]) {
      if (s.state === "dead" || s.state === "sink" || s.state === "gone") s.respawn(0.15 + n++ * 0.12);
      else s.heal();
    }
    return n;
  }

  reset() {
    for (const s of this.soldiers) {
      s.respawn(0);
      s.t = 10;
      s.pos.copy(s.home);
      s.set("idle");
      s.scale = 1;
      s.aiming = false;
    }
  }
}
