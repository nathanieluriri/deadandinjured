import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { gsap } from "gsap";
import GEO from "./logo-geometry.json";
import { skullShape, bandageShapes } from "./symbols.js";

// The portfolio's block logo, built from its own outlines, with a symbol in block 4's slot:
// a skull for dead, a bandage for injured.
const DEPTH = 0.13;
const BEVEL = 0.014;
const FIT = 0.26;
const TAU = Math.PI * 2;

function shapeOf(block) {
  const [cx, cy] = block.center;
  const pt = ([x, y]) => new THREE.Vector2(x - cx, cy - y);
  const s = new THREE.Shape(block.outer.map(pt));
  s.holes = block.holes.map((h) => new THREE.Path(h.map(pt)));
  return s;
}

let blockGeos = null;
function blocks() {
  blockGeos ||= GEO.blocks.map((b) => {
    const g = new THREE.ExtrudeGeometry(shapeOf(b), {
      depth: DEPTH - 2 * BEVEL, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL * 0.8,
      bevelOffset: -BEVEL * 0.8, bevelSegments: 4, steps: 1,
    });
    g.translate(0, 0, -(DEPTH - 2 * BEVEL) / 2);
    g.computeVertexNormals();
    return g;
  });
  return blockGeos;
}

function extrude(shape, depth, bevel) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3, curveSegments: 14, steps: 1 });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}

const physical = (color, rough = 0.32) => new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0, clearcoat: 0.9, clearcoatRoughness: 0.15 });

export const LOGO_MATS = {
  logo: physical(0xf1ece6),
  dead: new THREE.MeshPhysicalMaterial({ color: 0xc92a17, roughness: 0.42, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.25 }),
  band: new THREE.MeshPhysicalMaterial({ color: 0xea9a2c, roughness: 0.45, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.25 }),
  pad: physical(0xf7eddd, 0.4),
};

export function glyph(kind, mats = LOGO_MATS) {
  const g = new THREE.Group();
  if (kind === "dead") g.add(new THREE.Mesh(extrude(skullShape(), 0.2, 0.04), mats.dead));
  else {
    const { strip, pad } = bandageShapes();
    const band = new THREE.Group();
    band.add(new THREE.Mesh(extrude(strip, 0.11, 0.03), mats.band));
    const p = new THREE.Mesh(extrude(pad, 0.2, 0.035), mats.pad);
    band.add(p);
    band.rotation.z = -0.72;
    g.add(band);
  }
  return g;
}

export function buildLogo(kind, mats = LOGO_MATS) {
  const root = new THREE.Group();
  const spin = new THREE.Group();
  root.add(spin);
  const pivots = blocks().map((geo, i) => {
    const b = GEO.blocks[i];
    const pivot = new THREE.Group();
    const home = new THREE.Vector3(b.center[0] - GEO.aspect / 2, 0.5 - b.center[1], 0);
    pivot.position.copy(home);
    pivot.userData.home = home;
    pivot.add(new THREE.Mesh(geo, mats.logo));
    spin.add(pivot);
    return pivot;
  });
  const sym = glyph(kind, mats);
  sym.scale.setScalar(FIT);
  pivots[3].add(sym);
  return { root, spin, pivots, sym, kind };
}

// A second pass over the battlefield: the two logos, placed in CSS pixels so they line up
// with the page (the preloader's title, the volley stamps).
export class LogoHud {
  constructor(stage) {
    this.stage = stage;
    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(stage.renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pm.dispose();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 3.4);
    sun.position.set(-4, 3, -6);
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(2.5, 3, 6);
    this.scene.add(sun, key);
    this.camera = new THREE.PerspectiveCamera(22, 1, 10, 20000);
    this.logos = { dead: buildLogo("dead"), injured: buildLogo("injured") };
    this.state = {};
    for (const [k, l] of Object.entries(this.logos)) {
      l.root.visible = false;
      this.scene.add(l.root);
      this.state[k] = { on: false, t: Math.random() * 10, pop: 1, tilt: 0 };
    }
    this.time = 0;
    this.resize();
    addEventListener("resize", () => this.resize());
    stage.overlay = this;
    stage.hooks.push((dt, t, real) => this.update(real));
  }

  get active() {
    return this.logos.dead.root.visible || this.logos.injured.root.visible;
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    const d = h / 2 / Math.tan((this.camera.fov * Math.PI) / 360);
    this.camera.aspect = w / h;
    this.camera.position.set(w / 2, -h / 2, d);
    this.camera.lookAt(w / 2, -h / 2, 0);
    this.camera.near = d * 0.2;
    this.camera.far = d * 3;
    this.camera.updateProjectionMatrix();
    this.onResize?.();
  }

  // x and y are page pixels for the logo's centre; size is its height in pixels.
  place(kind, x, y, size) {
    const r = this.logos[kind].root;
    r.position.set(x, -y, 0);
    r.scale.setScalar(size);
  }

  // Blocks drop into place one after another, then the symbol pops into its slot.
  stackIn(kind, delay = 0) {
    const l = this.logos[kind];
    const st = this.state[kind];
    st.on = true;
    st.pop = 1;
    st.tilt = 0;
    l.root.visible = true;
    gsap.killTweensOf([l.spin.rotation, l.sym.scale, ...l.pivots.map((p) => p.position), ...l.pivots.map((p) => p.scale), ...l.pivots.map((p) => p.rotation)]);
    l.pivots.forEach((p, i) => {
      const h = p.userData.home;
      p.position.set(h.x, h.y + 1.4, h.z);
      p.scale.setScalar(0.0001);
      p.rotation.set(0, 0, (i % 2 ? 1 : -1) * 0.4);
      gsap.to(p.position, { y: h.y, duration: 0.75, delay: delay + i * 0.09, ease: "bounce.out" });
      gsap.to(p.scale, { x: 1, y: 1, z: 1, duration: 0.3, delay: delay + i * 0.09, ease: "power2.out" });
      gsap.to(p.rotation, { z: 0, duration: 0.6, delay: delay + i * 0.09, ease: "power2.out" });
    });
    l.sym.scale.setScalar(0.0001);
    gsap.to(l.sym.scale, { x: FIT, y: FIT, z: FIT, duration: 0.55, delay: delay + 0.62, ease: "back.out(2.6)" });
  }

  // The blocks break apart and fall away.
  breakOut(kind, delay = 0) {
    const l = this.logos[kind];
    const st = this.state[kind];
    if (!st.on) return;
    st.on = false;
    l.pivots.forEach((p, i) => {
      const h = p.userData.home;
      const dir = new THREE.Vector2(h.x, h.y).normalize();
      gsap.to(p.position, { x: h.x + dir.x * 0.9, y: h.y + dir.y * 0.9 - 0.6, duration: 0.55, delay: delay + i * 0.03, ease: "power2.in" });
      gsap.to(p.rotation, { z: dir.x * -1.4, x: 1.2, duration: 0.55, delay: delay + i * 0.03, ease: "power2.in" });
      gsap.to(p.scale, { x: 0.0001, y: 0.0001, z: 0.0001, duration: 0.5, delay: delay + 0.1 + i * 0.03, ease: "power2.in" });
    });
    gsap.to(l.sym.scale, { x: 0.0001, y: 0.0001, z: 0.0001, duration: 0.3, delay, ease: "power2.in", onComplete: () => {
      if (!st.on) gsap.delayedCall(0.4, () => { if (!st.on) l.root.visible = false; });
    } });
  }

  // Lands with a volley stamp: in big and tilted, down to size, then away with it.
  stamp(kind, { hold = 1.55, spin = false } = {}) {
    const l = this.logos[kind];
    const st = this.state[kind];
    this.stackIn(kind, 0);
    st.pop = 1.7;
    st.tilt = 0.12;
    gsap.killTweensOf(st, "pop,tilt");
    gsap.to(st, { tilt: 0.052, duration: 0.32, ease: "power3.out" });
    gsap.to(st, { pop: 1, duration: 0.32, ease: "power3.out" });
    if (spin) gsap.fromTo(l.spin.rotation, { y: 0 }, { y: TAU, duration: 1.1, delay: 0.5, ease: "power3.inOut" });
    clearTimeout(st.timer);
    st.timer = setTimeout(() => this.breakOut(kind), hold * 1000);
  }

  hide() {
    for (const k of Object.keys(this.logos)) {
      clearTimeout(this.state[k].timer);
      this.state[k].on = false;
      this.logos[k].root.visible = false;
    }
  }

  update(dt) {
    this.time += dt;
    for (const [k, l] of Object.entries(this.logos)) {
      if (!l.root.visible) continue;
      const st = this.state[k];
      st.t += dt;
      if (st.still) l.root.rotation.set(0.1, -0.32, 0);
      else l.root.rotation.set(Math.sin(st.t * 0.45) * 0.14, Math.sin(st.t * 0.6) * 0.32, st.tilt);
      l.spin.scale.setScalar(st.pop);
      l.sym.rotation.y = st.still ? 0.35 : Math.sin(st.t * 1.3) * 0.55;
    }
  }
}
