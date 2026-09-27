import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clone as cloneRig } from "three/addons/utils/SkeletonUtils.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { SIDES, groundHeight } from "./palette.js";

const N = 8;
const GRAVITY = 15;
const SCALE = 0.86;
const PIVOT = 0.8;
const TAU = Math.PI * 2;

// Part numbers are written into the model by tools/soldier.mjs.
const SKIN = [0xc68e5a, 0x9c6a3e, 0xe2b384, 0x7a4d2b, 0xd09a66, 0x5e3b22, 0xb57f4f, 0xeec59a];
const UNIFORM = {
  me: { 1: 0x201c19, 2: 0x7a6c53, 3: 0xdcd2bd, 4: 0x2a2623, 5: 0x2a2623, 6: 0xb4a78b, 7: 0x2f2a25, 8: 0xe8e0cf },
  opp: { 1: 0x1d1514, 2: 0x3a2c28, 3: 0xb5412b, 4: 0x251b19, 5: 0x251b19, 6: 0x7c2b1f, 7: 0xf2e8d8, 8: 0xc64a30 },
};
const RIFLE = { 9: 0x8b8f98, 10: 0x54555b, 11: 0x93623a, 12: 0x333338 };
const BAND = 0xf1eadf;
const CROSS = 0xc9311f;

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const tmpW = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);

const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const rand = (a, b) => a + Math.random() * (b - a);

function paint(geo, colors) {
  const part = geo.attributes._part;
  const out = new Uint8Array(part.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < part.count; i++) {
    c.setHex(colors[part.getX(i)] ?? 0xff00ff);
    out[i * 3] = Math.round(c.r * 255);
    out[i * 3 + 1] = Math.round(c.g * 255);
    out[i * 3 + 2] = Math.round(c.b * 255);
  }
  const g = new THREE.BufferGeometry();
  g.index = geo.index;
  for (const k of ["position", "normal", "skinIndex", "skinWeight"]) if (geo.attributes[k]) g.setAttribute(k, geo.attributes[k]);
  g.setAttribute("color", new THREE.BufferAttribute(out, 3, true));
  return g;
}

// A piece that can come off: its geometry, where it sits on its bone, and how it rests once it
// lands (the local axis that ends up pointing along `rest`, and how high its centre then sits).
function piece(mesh, rest) {
  mesh.updateMatrix();
  const box = new THREE.Box3().setFromBufferAttribute(mesh.geometry.attributes.position);
  const size = box.getSize(new THREE.Vector3()).multiply(mesh.scale).multiplyScalar(SCALE);
  const thin = size.x < size.y ? (size.x < size.z ? 0 : 2) : size.y < size.z ? 1 : 2;
  const axis = rest === DOWN ? Y.clone() : new THREE.Vector3().setComponent(thin, 1);
  return { mesh, attach: mesh.matrix.clone(), scale: mesh.scale.x * SCALE, axis, rest, lift: size.getComponent(rest === DOWN ? 1 : thin) / 2, size };
}

export async function loadSoldier(url) {
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
  const scene = gltf.scene;
  const helmet = piece(scene.getObjectByName("helmet"), DOWN);
  const rifle = piece(scene.getObjectByName("rifle"), UP);
  helmet.mesh.removeFromParent();
  rifle.mesh.removeFromParent();
  const body = scene.getObjectByProperty("isSkinnedMesh", true);
  return { scene, body: body.geometry, helmet, rifle, clips: Object.fromEntries(gltf.animations.map((c) => [c.name, c])) };
}

class Loose {
  constructor(p) {
    this.p = p;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.q = new THREE.Quaternion();
    this.restQ = new THREE.Quaternion();
    this.spin = new THREE.Vector3();
    this.on = true;
    this.rest = false;
  }

  launch(world, vel, spin) {
    world.decompose(this.pos, this.q, tmpS);
    this.vel.copy(vel);
    this.spin.copy(spin);
    this.on = false;
    this.rest = false;
  }

  update(dt) {
    if (this.on) return;
    if (this.rest) {
      this.q.slerp(this.restQ, 1 - Math.exp(-dt * 12));
      return;
    }
    this.vel.y -= GRAVITY * dt;
    this.pos.addScaledVector(this.vel, dt);
    const w = this.spin.length();
    if (w > 0) this.q.premultiply(tmpQ.setFromAxisAngle(tmpV.copy(this.spin).divideScalar(w), w * dt));
    const g = groundHeight(this.pos.x, this.pos.z) + this.p.lift * 0.8;
    if (this.pos.y > g) return;
    this.pos.y = g;
    if (this.vel.y < -2) {
      this.vel.y *= -0.35;
      this.vel.x *= 0.5;
      this.vel.z *= 0.5;
      this.spin.multiplyScalar(0.5);
    } else {
      this.rest = true;
      tmpV.copy(this.p.axis).applyQuaternion(this.q);
      this.restQ.setFromUnitVectors(tmpV, this.p.rest).multiply(this.q);
    }
  }

  matrix(out, sc) {
    return out.compose(this.pos, this.q, tmpS.setScalar(this.p.scale * sc));
  }
}

class Soldier {
  constructor(army, side, i, kit) {
    this.army = army;
    this.side = side;
    this.sd = SIDES[side];
    this.i = i;
    this.home = new THREE.Vector3(-3 + i * 2, 0, this.sd.z);
    this.pos = this.home.clone();
    this.vel = new THREE.Vector3();
    this.yaw = this.sd.face;
    this.spinVel = 0;
    this.flip = 0;
    this.flipTo = 0;
    this.state = "idle";
    this.t = 0;
    this.phase = Math.random() * 20;
    this.flash = 0;
    this.band = 0;
    this.scale = 1;
    this.lift = 0;
    this.hurt = 0;
    this.aiming = false;
    this.landed = false;
    this.bounces = 0;
    this.look = 0;
    this.lookNow = 0;
    this.lookT = rand(1, 4);
    this.helmet = new Loose(kit.helmet);
    this.rifle = new Loose(kit.rifle);

    this.root = new THREE.Group();
    const pivot = new THREE.Group();
    pivot.position.y = PIVOT;
    this.pivot = pivot;
    this.rig = cloneRig(kit.scene);
    this.rig.position.y = -PIVOT;
    this.rig.scale.setScalar(SCALE);
    pivot.add(this.rig);
    this.root.add(pivot);
    army.stage.scene.add(this.root);

    this.body = this.rig.getObjectByProperty("isSkinnedMesh", true);
    const colors = { ...UNIFORM[side], 0: SKIN[(i + (side === "opp" ? 4 : 0)) % SKIN.length] };
    this.body.geometry = paint(kit.body, colors);
    this.body.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.74, metalness: 0 });
    this.body.frustumCulled = false;
    const bone = (n) => this.rig.getObjectByName(n);
    this.bones = { head: bone("Head"), hand: bone("Index1R"), abdomen: bone("Abdomen"), neck: bone("Neck"), hips: bone("Hips") };

    this.mixer = new THREE.AnimationMixer(this.rig);
    this.acts = {};
    for (const [name, clip] of Object.entries(kit.clips)) this.acts[name] = this.mixer.clipAction(clip);
    this.act = null;
    this.stance(0);
  }

  get alive() {
    return this.state !== "dead" && this.state !== "sink" && this.state !== "gone";
  }

  set(state) {
    this.state = state;
    this.t = 0;
  }

  play(name, { fade = 0.22, loop = true, speed = 1, at = 0, hold = false } = {}) {
    const a = this.acts[name];
    const prev = this.act;
    a.reset();
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = !loop;
    a.timeScale = speed;
    a.time = at;
    a.paused = hold;
    a.play();
    if (prev && prev !== a) {
      if (fade > 0) {
        a.fadeIn(fade);
        // Fade out from wherever an interrupted fade left it, not from full weight.
        prev._scheduleFading(fade, prev.getEffectiveWeight(), 0);
      } else prev.stop();
    }
    this.act = a;
    this.clip = name;
    return a;
  }

  // The loop a standing soldier holds: rifle up while the squad aims, at ease otherwise.
  stance(fade = 0.3) {
    this.aimed = this.aiming;
    if (this.aiming) this.play("Idle_Shoot", { fade, at: 0.05, hold: true });
    else this.play("Idle", { fade, at: Math.random() * 1.6, speed: rand(0.85, 1.08) });
  }

  aim(on) {
    this.aiming = on;
  }

  duck() {
    if (!this.alive) return;
    this.set("duck");
    this.play("Duck", { fade: 0.1, loop: false, speed: rand(1.2, 1.4) });
  }

  wound() {
    if (!this.alive) return;
    this.set("wounded");
    this.flash = 1;
    this.vel.set(0, 0, 0);
    this.play("HitReact", { fade: 0.06, loop: false, speed: 1.05 });
    if (this.helmet.on) this.knock(this.helmet, 0.6, rand(3.2, 4.2), 7);
  }

  // Survived a sniper's miss: shakes his head at you.
  taunt() {
    if (!this.alive || !["idle", "shot", "flinch"].includes(this.state)) return;
    this.set("taunt");
    this.play("No", { fade: 0.2, loop: false, speed: 1.15 });
  }

  // A sniper's round finds him: the helmet goes, he reels, he stays up.
  shot(dir) {
    if (!this.alive) return;
    this.set("shot");
    this.flash = 1;
    this.play("HitReact", { fade: 0.05, loop: false, speed: 0.9 });
    if (this.helmet.on) this.knock(this.helmet, 1.1, rand(3.8, 4.8), 8, dir);
  }

  // A near miss: he flinches and carries on.
  flinch() {
    if (!this.alive || this.state !== "idle") return;
    this.set("flinch");
    this.play("HitReact", { fade: 0.06, loop: false, speed: 1.25 });
  }

  // Just above his head, where speech bubbles and sights go.
  above(out = new THREE.Vector3(), lift = 0.55) {
    return out.setFromMatrixPosition(this.bones.head.matrixWorld).setY(out.y + lift);
  }

  cheer() {
    if (!this.alive || this.state === "wounded") return;
    this.set("cheer");
    this.play("Wave", { fade: 0.2, speed: rand(1.25, 1.45), at: Math.random() });
  }

  salute() {
    if (!this.alive || this.state !== "idle") return;
    this.set("salute");
    this.play("Wave", { fade: 0.2, loop: false, speed: 1.15 });
  }

  // Blown backwards: a ballistic arc (big hits throw them higher and flip them), the fall
  // timed to land as the body does, helmet and rifle thrown clear.
  kill(dir, big = false) {
    if (!this.alive) return;
    this.set("dead");
    this.flash = 1;
    this.landed = false;
    this.bounces = 0;
    const launch = big || Math.random() < 0.45;
    const push = launch ? rand(2.6, 3.6) : rand(1.2, 1.8);
    const up = launch ? rand(5.2, 7) : rand(1.2, 1.8);
    this.vel.set(dir.x * push + rand(-0.6, 0.6), up, dir.z * push);
    this.spinVel = rand(-1, 1) * (launch ? 3.2 : 0.6);
    this.flipTo = big && launch && Math.random() < 0.7 ? -TAU : 0;
    this.air = (2 * up) / GRAVITY;
    this.play("Death", { fade: 0.06, loop: false, speed: THREE.MathUtils.clamp(0.62 / (0.85 * this.air), 0.55, 1.1) });
    if (this.helmet.on) this.knock(this.helmet, 1.5, rand(4.5, 6.5), 9, dir);
    if (this.rifle.on) this.knock(this.rifle, 1.2, rand(3, 5), 7, dir);
  }

  knock(item, push, up, spin, dir = tmpW.set(0, 0, this.sd.dir)) {
    const world = item === this.helmet ? this.helmetMatrix(tmpM) : this.rifleMatrix(tmpM);
    item.launch(world, tmpV.set(dir.x * push + rand(-1.2, 1.2), up, dir.z * push + rand(-0.8, 0.8)), tmpW.set(rand(-spin, spin), rand(-spin, spin), rand(-spin, spin)));
  }

  sink() {
    if (this.state === "dead") this.set("sink");
  }

  respawn(delay = 0) {
    this.set("rise");
    this.t = -delay;
    this.risen = false;
    this.flip = this.flipTo = 0;
    this.spinVel = 0;
    this.yaw = this.sd.face;
    this.helmet.on = true;
    this.rifle.on = true;
    this.band = 0;
    this.hurt = 0;
    this.flash = 0;
    this.scale = 1;
    this.pos.set(this.home.x, -1.4, this.home.z + this.sd.dir * 2.5);
  }

  heal() {
    if (this.state !== "wounded") return;
    this.set("idle");
    this.stance();
  }

  helmetMatrix(out) {
    return out.multiplyMatrices(this.bones.head.matrixWorld, this.army.kit.helmet.attach);
  }

  rifleMatrix(out) {
    return out.multiplyMatrices(this.bones.hand.matrixWorld, this.army.kit.rifle.attach);
  }

  // Where the body is, for dust and shadows: the hips, which the fall carries away from the feet.
  middle(out = new THREE.Vector3()) {
    return out.setFromMatrixPosition(this.bones.hips.matrixWorld);
  }

  update(dt, time) {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 3.2);
    let lift = 0;
    let hurt = 0;
    const a = this.act;
    const done = !a.isRunning() || a.time >= a.getClip().duration;

    this.lookT -= dt;
    if (this.lookT < 0) {
      this.lookT = rand(1.5, 5);
      this.look = rand(-0.55, 0.55);
    }

    switch (this.state) {
      case "idle":
        if (this.aiming !== this.aimed) this.stance();
        break;
      case "duck":
        if (done) {
          this.set("idle");
          this.stance(0.35);
        }
        break;
      case "wounded": {
        hurt = 1;
        const stagger = Math.max(0, 1 - this.t * 2.5);
        this.pos.z += stagger * 0.45 * this.sd.dir * dt * 3;
        this.pos.z = damp(this.pos.z, this.home.z, 1.5, dt);
        this.band = damp(this.band, 1, 9, dt);
        if (this.clip === "HitReact" && done) this.play("Idle", { fade: 0.35, speed: 0.62, at: Math.random() });
        break;
      }
      case "cheer":
        lift = Math.abs(Math.sin(this.t * 7 + this.phase)) * 0.32;
        if (this.t > 3.5) {
          this.set("idle");
          this.stance();
        }
        break;
      case "taunt":
      case "shot":
      case "flinch":
      case "salute":
        if (done) {
          this.set("idle");
          this.stance();
        }
        break;
      case "rise": {
        if (this.t < 0) {
          this.scale = 0;
          break;
        }
        this.scale = 1;
        if (!this.risen && this.clip !== "Jump_Idle") this.play("Jump_Idle", { fade: 0, speed: 1.3 });
        const u = Math.min(1, this.t / 0.75);
        const from = this.home.z + this.sd.dir * 2.5;
        this.pos.x = this.home.x;
        this.pos.z = from + (this.home.z - from) * u;
        this.pos.y = -1.4 * (1 - u) * (1 - u) + Math.sin(u * Math.PI) * 0.25;
        if (u >= 1 && !this.risen) {
          this.risen = true;
          this.pos.copy(this.home);
          this.play("Jump_Land", { fade: 0.12, loop: false, speed: 1.2 });
          this.army.emit("risen", this);
        }
        if (this.risen && done) {
          this.set("idle");
          this.stance(0.25);
        }
        break;
      }
      case "dead":
        this.fly(dt);
        break;
      case "sink":
        this.pos.y -= dt * 1.1;
        this.scale = Math.max(0, 1 - this.t * 1.3);
        if (this.scale <= 0) this.set("gone");
        break;
    }

    this.lift = damp(this.lift, lift, 18, dt);
    this.hurt = damp(this.hurt, hurt, 6, dt);
    this.lookNow = damp(this.lookNow, this.state === "idle" && !this.aiming ? this.look : 0, 3, dt);
    this.helmet.update(dt);
    this.rifle.update(dt);
  }

  fly(dt) {
    const g = groundHeight(this.pos.x, this.pos.z);
    const air = this.pos.y > g + 0.001 || this.vel.y > 0;
    if (air) {
      this.vel.y -= GRAVITY * dt;
      this.pos.addScaledVector(this.vel, dt);
      this.yaw += this.spinVel * dt;
      if (this.flipTo) this.flip = this.flipTo * Math.min(1, 1 - Math.pow(1 - Math.min(1, this.t / this.air), 2));
    }
    if (this.pos.y <= g) {
      this.pos.y = g;
      if (this.vel.y < -2.5 && this.bounces < 1 && this.air > 0.5) {
        this.bounces++;
        this.vel.y *= -0.25;
        this.vel.x *= 0.45;
        this.vel.z *= 0.45;
        this.spinVel *= 0.4;
      } else {
        this.vel.set(0, 0, 0);
        this.spinVel = 0;
      }
      this.flip = this.flipTo;
    }
    if (!this.landed && this.pos.y <= g + 0.02 && this.act.time > 0.42) {
      this.landed = true;
      this.army.emit("landed", this);
    }
  }

  // Small adjustments on top of the clip: the idle glance, and a wounded soldier's stoop. Bones
  // a clip leaves alone keep last frame's value, so each tweak is taken back before the mixer runs.
  tweak() {
    const b = this.bones;
    this.bend(b.head, Y, this.lookNow, 0);
    this.bend(b.abdomen, X, 0.42 * this.hurt, 1);
    this.bend(b.neck, X, 0.2 * this.hurt, 2);
  }

  bend(bone, axis, angle, k) {
    const saved = (this.saved ||= [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()]);
    const bones = (this.bent ||= []);
    bones[k] = Math.abs(angle) > 0.001 ? bone : null;
    if (!bones[k]) return;
    saved[k].copy(bone.quaternion);
    bone.quaternion.multiply(tmpQ.setFromAxisAngle(axis, angle));
  }

  untweak() {
    if (!this.bent) return;
    this.bent.forEach((bone, k) => bone && bone.quaternion.copy(this.saved[k]));
  }

  place() {
    const r = this.root;
    const hide = this.army.hidden[this.side] || this.state === "gone" || this.scale <= 0.001;
    r.visible = !hide;
    r.position.set(this.pos.x, this.pos.y + this.lift, this.pos.z);
    r.rotation.set(0, this.yaw, 0);
    r.scale.setScalar(Math.max(0.001, this.scale));
    this.pivot.rotation.x = this.flip;
    const m = this.body.material;
    const dim = this.state === "dead" || this.state === "sink" ? 0.72 : 1;
    m.color.setScalar(dim);
    m.emissive.setRGB(1, 0.9, 0.78).multiplyScalar(this.flash * this.flash * 0.45);
    r.updateMatrixWorld(true);
  }
}

export class Army {
  constructor(stage, kit) {
    this.stage = stage;
    this.kit = kit;
    this.listeners = {};
    this.soldiers = [];
    for (const side of ["me", "opp"]) for (let i = 0; i < 4; i++) this.soldiers.push(new Soldier(this, side, i, kit));
    this.squads = { me: this.soldiers.slice(0, 4), opp: this.soldiers.slice(4) };

    const inst = (geo, count) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 }), count);
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < count; i++) m.setColorAt(i, new THREE.Color(1, 1, 1));
      stage.scene.add(m);
      return m;
    };
    this.helmets = {
      me: inst(paint(kit.helmet.mesh.geometry, UNIFORM.me), 4),
      opp: inst(paint(kit.helmet.mesh.geometry, UNIFORM.opp), 4),
    };
    this.rifles = inst(paint(kit.rifle.mesh.geometry, RIFLE), N);
    this.rifles.material.roughness = 0.45;
    this.rifles.material.metalness = 0.25;
    this.bands = inst(bandage(), N);
    this.bandAt = bandPlace(kit.helmet);

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

    this.white = new THREE.Color();
    this.m = new THREE.Matrix4();
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this.a = new THREE.Vector3();
    this.b = new THREE.Vector3();
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
    const { m, zero, a, b } = this;
    for (let i = 0; i < N; i++) {
      const s = this.soldiers[i];
      s.update(dt, time);
      s.untweak();
      s.mixer.update(dt);
      s.tweak();
      s.place();
      const show = s.root.visible;
      const sc = s.scale;
      const dim = s.state === "dead" || s.state === "sink" ? 0.72 : 1;
      const glow = 1 + s.flash * s.flash * 0.8;
      this.white.setScalar(dim * glow);

      const helmets = this.helmets[s.side];
      helmets.setMatrixAt(s.i, !show ? zero : s.helmet.on ? s.helmetMatrix(m) : s.helmet.matrix(m, sc));
      helmets.setColorAt(s.i, this.white);
      this.rifles.setMatrixAt(i, !show ? zero : s.rifle.on ? s.rifleMatrix(m) : s.rifle.matrix(m, sc));
      this.rifles.setColorAt(i, this.white);
      if (show && s.band > 0.01) {
        m.multiplyMatrices(s.bones.head.matrixWorld, this.bandAt);
        this.bands.setMatrixAt(i, m.multiply(tmpM.makeScale(s.band, s.band, s.band)));
      } else this.bands.setMatrixAt(i, zero);

      // The shadow runs from the feet to the head, so a body lying flat casts a long one.
      s.middle(a);
      b.setFromMatrixPosition(s.bones.head.matrixWorld);
      const gy = groundHeight(a.x, a.z) + 0.02;
      const air = Math.max(0, Math.min(a.y, b.y) - gy - 0.3);
      const dx = b.x - s.pos.x;
      const dz = b.z - s.pos.z;
      const len = Math.hypot(dx, dz);
      const w = 1.05 * sc * Math.max(0.3, 1 - air * 0.3);
      tmpQ.setFromAxisAngle(UP, Math.atan2(dx, dz));
      m.compose(tmpV.set((s.pos.x + b.x) / 2, gy, (s.pos.z + b.z) / 2), tmpQ, tmpS.set(w, 1, Math.max(w, len * 1.25)));
      this.shadows.setMatrixAt(i, show ? m : zero);
    }
    for (const mesh of [this.helmets.me, this.helmets.opp, this.rifles, this.bands, this.shadows]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
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
      s.pos.copy(s.home);
      s.set("idle");
      s.aiming = false;
      s.stance(0);
    }
  }
}

// A field dressing: a cream band with a red cross on the front.
function bandage() {
  const parts = [
    [new THREE.CylinderGeometry(1, 1, 0.34, 20, 1, true), BAND],
    [new THREE.BoxGeometry(0.34, 0.1, 0.06).translate(0, 0, 1.01), CROSS],
    [new THREE.BoxGeometry(0.1, 0.34, 0.06).translate(0, 0, 1.01), CROSS],
  ].map(([g, hex]) => {
    const out = g.toNonIndexed();
    const c = new THREE.Color(hex);
    const n = out.attributes.position.count;
    const col = new Uint8Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b].map((v) => Math.round(v * 255)), i * 3);
    out.setAttribute("color", new THREE.BufferAttribute(col, 3, true));
    out.deleteAttribute("uv");
    return out;
  });
  return mergeGeometries(parts);
}

// The band sits under the helmet's brim, sized to the head it wraps.
function bandPlace(helmet) {
  const box = new THREE.Box3().setFromBufferAttribute(helmet.mesh.geometry.attributes.position);
  const c = box.getCenter(new THREE.Vector3()).applyMatrix4(helmet.attach);
  const s = box.getSize(new THREE.Vector3()).multiply(helmet.mesh.scale);
  const r = Math.min(s.x, s.z) * 0.4;
  return new THREE.Matrix4().compose(new THREE.Vector3(c.x, c.y - s.y * 0.3, c.z), new THREE.Quaternion(), new THREE.Vector3(r, r, r));
}
