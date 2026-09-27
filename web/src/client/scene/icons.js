import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { tint, join, box, cyl, fieldPhone, signpost } from "./kit.js";
import { SIDES } from "./palette.js";
import { buildPlane } from "./plane.js";
import { rock, paper, blade } from "./rps.js";

// The tools of the match as small clay objects: the taskbar's icons, the pause stud and the
// supply draw's hands. They are drawn in a second pass over the field with an orthographic
// camera in page pixels, each one sitting on the real button that takes the clicks.
const K = {
  metal: 0x34343a, dark: 0x1d1c1f, brass: 0xb58d3c, brassDark: 0x7d5f24, wood: 0x7a5431, woodLight: 0x9c7445,
  clay: SIDES.me.clay, olive: 0x5d6136, oliveDark: 0x454828, cream: 0xefe6d0, leather: 0x5e3822, leatherDark: 0x40261a,
  paper: 0xf0e7d3, ink: 0x2a2520, glass: 0x8fb9d0, smoke: 0xd8d2c7, pencil: 0xd9a42b, eraser: 0xd98a82, red: 0xb8391f,
};

const PI = Math.PI;
const blob = (r) => new THREE.IcosahedronGeometry(r, 1);

function gun() {
  const parts = [];
  const iron = 0x4a4c52;
  for (const x of [0.42, -0.42]) {
    parts.push([new THREE.TorusGeometry(0.38, 0.07, 6, 20).rotateY(PI / 2).translate(x, 0.38, 0), K.dark]);
    for (let i = 0; i < 6; i++) parts.push([new THREE.BoxGeometry(0.04, 0.7, 0.045).rotateX((i * PI) / 6).translate(x, 0.38, 0), K.woodLight]);
    parts.push([cyl(0.09, 0.09, 0.12, 10).rotateZ(PI / 2).translate(x, 0.38, 0), K.brass]);
  }
  parts.push([cyl(0.05, 0.05, 0.86, 8).rotateZ(PI / 2).translate(0, 0.38, 0), iron]);
  parts.push([box(0.98, 0.6, 0.07, 0.025).rotateX(-0.14).translate(0, 0.76, 0.16), K.clay]);
  parts.push([box(0.2, 0.14, 0.6, 0.04).rotateX(-0.3).translate(0, 0.3, -0.42), K.clay]);
  const barrel = [
    [cyl(0.08, 0.12, 1.25, 14).rotateX(PI / 2).translate(0, 0, 0.45), iron],
    [new THREE.TorusGeometry(0.085, 0.03, 6, 14).translate(0, 0, 1.07), K.brass],
    [new THREE.SphereGeometry(0.17, 12, 10).translate(0, 0, -0.2), iron],
  ].map(([g, c]) => [g.rotateX(-0.42).translate(0, 0.7, 0.05), c]);
  return join([...parts, ...barrel]);
}

function scope() {
  return join([
    [cyl(0.1, 0.1, 1.1, 18).rotateZ(PI / 2), K.metal],
    [cyl(0.11, 0.18, 0.3, 20).rotateZ(PI / 2).translate(0.66, 0, 0), K.metal],
    [cyl(0.155, 0.155, 0.02, 20).rotateZ(PI / 2).translate(0.82, 0, 0), K.glass],
    [cyl(0.135, 0.1, 0.24, 18).rotateZ(PI / 2).translate(-0.66, 0, 0), K.metal],
    [new THREE.TorusGeometry(0.12, 0.035, 8, 18).rotateY(PI / 2).translate(-0.78, 0, 0), K.dark],
    [cyl(0.07, 0.07, 0.15, 14).translate(0.05, 0.15, 0), K.brass],
    [cyl(0.08, 0.08, 0.05, 14).translate(0.05, 0.24, 0), K.metal],
    [cyl(0.06, 0.06, 0.13, 14).rotateX(PI / 2).translate(0.05, 0, 0.14), K.brass],
    ...[-0.32, 0.36].map((x) => [new THREE.TorusGeometry(0.112, 0.03, 8, 18).rotateY(PI / 2).translate(x, 0, 0), K.brass]),
    ...[-0.32, 0.36].map((x) => [box(0.09, 0.12, 0.16, 0.02).translate(x, -0.15, 0), K.metal]),
  ]);
}

function smoke() {
  const parts = [
    [cyl(0.2, 0.2, 0.56, 20).translate(0, 0.28, 0), K.olive],
    [cyl(0.206, 0.206, 0.09, 20).translate(0, 0.38, 0), K.cream],
    [cyl(0.16, 0.2, 0.07, 20).translate(0, 0.595, 0), K.oliveDark],
    [cyl(0.05, 0.05, 0.08, 10).translate(0, 0.67, 0), K.metal],
    [new THREE.TorusGeometry(0.07, 0.016, 6, 14).rotateX(0.4).translate(0.13, 0.66, 0.04), K.metal],
  ];
  const puffs = [[0.02, 0.82, 0, 0.09], [0.1, 0.97, 0.02, 0.13], [0.26, 1.1, 0, 0.17], [0.46, 1.14, -0.02, 0.2], [0.64, 1.04, 0.02, 0.21], [0.74, 0.86, 0, 0.18], [0.36, 1.26, -0.05, 0.15], [0.58, 1.26, 0.04, 0.14]];
  puffs.forEach(([x, y, z, r], i) => parts.push([blob(r).translate(x, y, z), i % 2 ? K.smoke : 0xe9e4da]));
  return join(parts);
}

function notebook() {
  const parts = [
    [box(0.74, 0.98, 0.035, 0.03).translate(0, 0, -0.055), K.leather],
    [box(0.74, 0.98, 0.035, 0.03).translate(0, 0, 0.055), K.leather],
    [new THREE.BoxGeometry(0.7, 0.93, 0.08).translate(0.01, 0, 0), K.paper],
    [box(0.06, 0.98, 0.15, 0.02).translate(-0.36, 0, 0), K.leatherDark],
    [new THREE.BoxGeometry(0.04, 1.0, 0.16).translate(0.24, 0, 0), K.dark],
    [new THREE.BoxGeometry(0.42, 0.17, 0.012).translate(-0.02, 0.24, 0.078), K.paper],
    [new THREE.BoxGeometry(0.3, 0.018, 0.01).translate(-0.04, 0.26, 0.086), K.ink],
    [new THREE.BoxGeometry(0.22, 0.018, 0.01).translate(-0.08, 0.21, 0.086), K.ink],
  ];
  const pencil = [
    [cyl(0.034, 0.034, 0.78, 6), K.pencil],
    [new THREE.ConeGeometry(0.034, 0.12, 6).translate(0, -0.45, 0).rotateZ(PI), K.woodLight],
    [new THREE.ConeGeometry(0.012, 0.04, 6).translate(0, -0.52, 0).rotateZ(PI), K.ink],
    [cyl(0.036, 0.036, 0.05, 8).translate(0, 0.41, 0), K.brass],
    [cyl(0.034, 0.034, 0.06, 8).translate(0, 0.46, 0), K.eraser],
  ].map(([g, c]) => [g.rotateZ(-0.75).translate(0.08, -0.05, 0.11), c]);
  return join([...parts, ...pencil]);
}

function bubble() {
  const s = new THREE.Shape();
  s.moveTo(-0.3, -0.2);
  s.lineTo(-0.04, -0.2);
  s.lineTo(-0.42, -0.52);
  const tail = new THREE.ExtrudeGeometry(s, { depth: 0.18, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 }).translate(0, 0, -0.09);
  return join([
    [box(1.0, 0.66, 0.2, 0.1), K.cream],
    [tail, K.cream],
    ...[-0.22, 0, 0.22].map((x) => [new THREE.SphereGeometry(0.065, 12, 8).scale(1, 1, 0.5).translate(x, 0.02, 0.1), K.ink]),
  ]);
}

function canister() {
  return join([
    [cyl(0.2, 0.2, 0.56, 20).translate(0, 0.28, 0), K.olive],
    [cyl(0.206, 0.206, 0.09, 20).translate(0, 0.38, 0), K.cream],
    [cyl(0.16, 0.2, 0.07, 20).translate(0, 0.595, 0), K.oliveDark],
    [cyl(0.05, 0.05, 0.08, 10).translate(0, 0.67, 0), K.metal],
  ]);
}

function stud() {
  return join([
    [cyl(0.5, 0.5, 0.14, 36).rotateX(PI / 2), K.brass],
    [new THREE.TorusGeometry(0.5, 0.045, 8, 36), K.brassDark],
    ...[-0.13, 0.13].map((x) => [box(0.13, 0.44, 0.08, 0.03).translate(x, 0, 0.09), K.leatherDark]),
  ]);
}

export function padlock() {
  return join([
    [box(0.38, 0.3, 0.14, 0.05), K.brass],
    [new THREE.TorusGeometry(0.12, 0.035, 8, 16, PI).translate(0, 0.15, 0), K.metal],
    [new THREE.BoxGeometry(0.045, 0.1, 0.01).translate(0, -0.03, 0.075), K.ink],
    [new THREE.SphereGeometry(0.035, 10, 8).scale(1, 1, 0.3).translate(0, 0.03, 0.075), K.ink],
  ]);
}

function crate(props) {
  let geo = null;
  props?.traverse((o) => {
    if (o.isMesh && o.name === "crate") geo = o.geometry.clone();
  });
  if (!geo) return join([[box(1, 0.9, 0.9, 0.04), K.wood]]);
  const g = new THREE.BufferGeometry();
  for (const k of ["position", "normal", "color"]) {
    const a = geo.attributes[k];
    const out = new Float32Array(a.count * 3);
    for (let i = 0; i < a.count; i++) out.set([a.getX(i), a.getY(i), a.getZ(i)], i * 3);
    g.setAttribute(k, new THREE.BufferAttribute(out, 3));
  }
  g.setIndex(geo.index);
  return g;
}

function scissors() {
  const geo = blade(SIDES.me.clay);
  return mergeGeometries([geo.clone().rotateZ(0.32), geo.clone().rotateY(PI).rotateZ(-0.32)]);
}

// Each icon: how to build it and the angle it is shown at.
const ICONS = {
  aim: { build: gun, pose: [0.42, -0.55, 0], size: 1.02 },
  recon: { build: () => buildPlane(SIDES.me.clay, 0x2b2622), pose: [1.05, 2.36, 0.32], plane: true, size: 1.08 },
  sniper: { build: scope, pose: [0.45, 0.5, 0.35], size: 1.02 },
  smoke: { build: smoke, pose: [0.2, -0.5, 0], size: 0.88 },
  log: { build: notebook, pose: [0.42, -0.42, 0.08], size: 0.8 },
  chat: { build: bubble, pose: [0.18, -0.4, 0], size: 0.84 },
  crate: { build: crate, pose: [0.38, 0.62, 0], size: 1 },
  pause: { build: stud, pose: [0.16, -0.28, 0], size: 1 },
  rock: { build: () => rock(SIDES.me.clay), pose: [0.3, 0.4, 0], size: 0.9 },
  paper: { build: () => paper(SIDES.opp.clay), pose: [0.15, -0.35, 0.12], size: 0.95 },
  scissors: { build: scissors, pose: [0.2, -0.3, -0.6], size: 1 },
  phone: { build: fieldPhone, pose: [0.2, -0.4, 0], size: 1.08 },
  signpost: { build: signpost, pose: [0.12, -0.5, 0], size: 1.05 },
};

const still = matchMedia("(prefers-reduced-motion: reduce)");
const mat = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.58, metalness: 0.06 });
const GREY = 0x8d877c;

// Fits a model to a unit box once it is turned to its pose, centred on the origin.
function fit(obj, pose) {
  const probe = new THREE.Group();
  probe.rotation.set(...pose);
  probe.add(obj);
  probe.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(probe);
  const size = b.getSize(new THREE.Vector3());
  const c = b.getCenter(new THREE.Vector3());
  probe.remove(obj);
  const k = 1 / Math.max(size.x, size.y);
  const spin = new THREE.Group();
  spin.rotation.set(...pose);
  spin.add(obj);
  const holder = new THREE.Group();
  holder.add(spin);
  spin.position.copy(c).multiplyScalar(-1);
  const root = new THREE.Group();
  root.add(holder);
  root.scale.setScalar(k);
  root.userData.k = k;
  return { root, spin, holder };
}

// Painted backdrops for the supply previews, the way a photograph in a dossier would show them.
function backdrop(kind) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 192;
  const x = c.getContext("2d");
  const sky = x.createLinearGradient(0, 0, 0, 192);
  const cols = {
    recon: ["#e3cfa9", "#c7a77a", "#93764e"],
    sniper: ["#6f5a4a", "#4b3a2f", "#2c211b"],
    smoke: ["#c9a987", "#9a7a5a", "#5f4731"],
  }[kind];
  sky.addColorStop(0, cols[0]);
  sky.addColorStop(0.55, cols[1]);
  sky.addColorStop(1, cols[2]);
  x.fillStyle = sky;
  x.fillRect(0, 0, 256, 192);
  const hills = (y, amp, color, seed) => {
    x.fillStyle = color;
    x.beginPath();
    x.moveTo(0, 192);
    for (let px = 0; px <= 256; px += 16) x.lineTo(px, y + Math.sin(px * 0.03 + seed) * amp + Math.sin(px * 0.11 + seed * 2) * amp * 0.3);
    x.lineTo(256, 192);
    x.fill();
  };
  if (kind === "recon") {
    hills(118, 8, "#a88c62", 1);
    hills(140, 5, "#8c7049", 3);
    x.strokeStyle = "#5c4830";
    x.lineWidth = 4;
    x.beginPath();
    for (let px = -10; px <= 270; px += 22) x.lineTo(px, 160 + (px / 22 % 2 ? 6 : -6));
    x.stroke();
  } else if (kind === "sniper") {
    hills(96, 6, "#3e3027", 2);
    x.fillStyle = "#5a4a36";
    for (let px = -6; px < 262; px += 26) {
      x.beginPath();
      x.ellipse(px + 13, 136, 14, 8, 0, 0, Math.PI * 2);
      x.fill();
    }
    x.fillStyle = "#4a3c2c";
    x.fillRect(0, 140, 256, 52);
  } else {
    hills(110, 7, "#7d6246", 4);
    x.fillStyle = "#6b5a40";
    for (let px = -6; px < 262; px += 24) {
      x.beginPath();
      x.ellipse(px + 12, 150, 13, 8, 0, 0, Math.PI * 2);
      x.fill();
    }
    x.fillStyle = "#4a3a28";
    x.fillRect(0, 154, 256, 38);
  }
  // Grain and a little fading at the edges: an old print.
  for (let i = 0; i < 2600; i++) {
    x.fillStyle = `rgba(${Math.random() < 0.5 ? "0,0,0" : "255,240,210"},${Math.random() * 0.08})`;
    x.fillRect(Math.random() * 256, Math.random() * 192, 1.3, 1.3);
  }
  const v = x.createRadialGradient(128, 96, 60, 128, 96, 170);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(40,25,10,0.45)");
  x.fillStyle = v;
  x.fillRect(0, 0, 256, 192);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const glow = (() => {
  let tex = null;
  return () => {
    if (tex) return tex;
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d");
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.3, "rgba(255,255,255,0.5)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    tex = new THREE.CanvasTexture(c);
    return tex;
  };
})();

// The little scene behind each dossier's photograph. Everything is laid out in a unit square
// that is scaled to the photo on screen.
function vignette(kind) {
  const g = new THREE.Group();
  const back = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: backdrop(kind), toneMapped: false, depthWrite: false }));
  back.position.z = -0.9;
  back.renderOrder = -1;
  g.add(back);
  const clay = mat();
  const v = { kind, group: g, back, t: 0 };
  if (kind === "recon") {
    const plane = buildPlane(SIDES.me.clay, 0x2b2622);
    plane.traverse((o) => o.isMesh && (o.material = clay));
    const holder = new THREE.Group();
    holder.add(plane);
    plane.scale.setScalar(0.05);
    plane.rotation.set(0.45, Math.PI / 2 - 0.35, 0.1);
    g.add(holder);
    const flare = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), new THREE.MeshBasicMaterial({ color: 0x74ff8a, toneMapped: false }));
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), new THREE.MeshBasicMaterial({ map: glow(), color: 0x74ff8a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    flare.add(halo);
    g.add(flare);
    Object.assign(v, { plane, holder, flare, halo, found: true });
  } else if (kind === "sniper") {
    const target = new THREE.Group();
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), clay);
    const skin = new THREE.Color(0xc68e5a);
    head.geometry = tint(head.geometry, skin);
    const helmet = new THREE.Mesh(join([
      [new THREE.SphereGeometry(0.12, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), SIDES.opp.clay],
      [new THREE.TorusGeometry(0.12, 0.018, 6, 20).rotateX(Math.PI / 2), 0xf2e8d8],
    ]), clay);
    helmet.position.y = 0.04;
    const bags = new THREE.Mesh(join([-0.36, -0.12, 0.12, 0.36].map((x2) => [box(0.24, 0.12, 0.14, 0.05).translate(x2, -0.12, 0.05), 0x75664a])), clay);
    target.add(head, helmet, bags);
    target.position.y = -0.05;
    g.add(target);
    Object.assign(v, { target, head, helmet });
  } else {
    const can = new THREE.Mesh(canister(), clay);
    can.scale.setScalar(0.34);
    can.position.set(-0.28, -0.3, 0.1);
    can.rotation.set(0.25, 0.5, -0.15);
    g.add(can);
    const puffs = [];
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(blob(1), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xe6e0d6 : 0xcfc8bc, roughness: 0.95, transparent: true, depthWrite: false }));
      g.add(m);
      puffs.push({ m, at: i / 10 });
    }
    Object.assign(v, { can, puffs });
  }
  return v;
}

export class IconDeck {
  constructor(stage, { environment = null, props = null } = {}) {
    this.stage = stage;
    this.props = props;
    this.scene = new THREE.Scene();
    this.scene.environment = environment;
    this.scene.environmentIntensity = 0.75;
    this.scene.add(new THREE.HemisphereLight(0xffdcc0, 0x3a3040, 0.85));
    const key = new THREE.DirectionalLight(0xffb07a, 2.7);
    key.position.set(-1.1, 1.3, 1.6);
    const rim = new THREE.DirectionalLight(0x9fb4ff, 0.9);
    rim.position.set(1.5, 0.4, -1);
    this.scene.add(key, rim);
    this.camera = new THREE.OrthographicCamera(0, 1, 0, -1, -4000, 4000);
    this.camera.position.z = 1000;
    this.items = new Map();
    this.boards = new Map();
    this.vignettes = {};
    this.shown = null;
    this.on = false;
    this.lockGeo = padlock();
    this.time = 0;
    this.resize();
    addEventListener("resize", () => this.resize());
    stage.overlays.push(this);
    stage.hooks.push((dt, t, real) => this.update(real));
  }

  get active() {
    return this.on;
  }

  resize() {
    const c = this.camera;
    c.left = 0;
    c.right = innerWidth;
    c.top = 0;
    c.bottom = -innerHeight;
    c.updateProjectionMatrix();
  }

  // An icon for `name`, drawn over `el` at `size` of the element's height.
  add(key, el, { kind = key, size = 0.78, hit = el } = {}) {
    const spec = ICONS[kind];
    size *= spec.size || 1;
    const built = spec.build(this.props);
    const paint = mat();
    const grey = new THREE.MeshStandardMaterial({ color: GREY, roughness: 0.8, metalness: 0 });
    let obj;
    const meshes = [];
    if (built.isObject3D) {
      obj = built;
      obj.traverse((o) => o.isMesh && meshes.push(o));
      for (const m of meshes) m.material = paint;
    } else {
      obj = new THREE.Mesh(built, paint);
      meshes.push(obj);
    }
    const { root, spin, holder } = fit(obj, spec.pose);
    const lock = new THREE.Mesh(this.lockGeo, mat());
    lock.visible = false;
    lock.scale.setScalar(1.05 / root.userData.k);
    lock.position.set(0.34 / root.userData.k, -0.3 / root.userData.k, 0.6 / root.userData.k);
    holder.add(lock);
    root.visible = false;
    this.scene.add(root);
    const item = {
      key, el, size, root, spin, holder, meshes, paint, grey, lock, plane: spec.plane ? obj : null,
      k: root.userData.k, hover: 0, hoverTo: 0, press: 0, pulse: 0, state: "on", dimK: 1, t: Math.random() * 10,
    };
    this.items.set(key, item);
    this.hoverable(item, hit);
    return item;
  }

  hoverable(item, el) {
    const on = () => (item.hoverTo = 1);
    const off = () => (item.hoverTo = document.activeElement === el ? 1 : 0);
    el.addEventListener("pointerenter", on);
    el.addEventListener("pointerleave", off);
    el.addEventListener("focus", on);
    el.addEventListener("blur", () => (item.hoverTo = 0));
    el.addEventListener("pointerdown", () => (item.press = 1));
  }

  // "on", "dim" (not now), "lock" (used this turn) or "grey" (none left).
  setState(key, state) {
    const it = this.items.get(key);
    if (!it || it.state === state) return;
    it.state = state;
    const m = state === "grey" ? it.grey : it.paint;
    for (const mesh of it.meshes) mesh.material = m;
    it.lock.visible = state === "lock";
  }

  // A wooden board under a row of icons, sized to `el`.
  addBoard(key, el, canvas) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82, metalness: 0, color: 0xd8cbb8 }));
    mesh.rotation.x = -0.32;
    mesh.visible = false;
    this.scene.add(mesh);
    this.boards.set(key, { el, mesh, tex, w: 0, h: 0 });
  }

  // Shows the live scene for a supply inside its dossier's photograph. The photograph sits on
  // an opaque card above the field, so it gets a small canvas of its own, made the first time
  // a supply is opened and moved from photo to photo.
  preview(kind, el) {
    if (!this.film) {
      const canvas = document.createElement("canvas");
      canvas.className = "film";
      const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "low-power", stencil: false });
      r.outputColorSpace = THREE.SRGBColorSpace;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = 1.1;
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffdcc0, 0x3a3040, 1.3));
      const key = new THREE.DirectionalLight(0xffc08a, 3);
      key.position.set(-1, 1.4, 1.6);
      scene.add(key);
      const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, -10, 10);
      this.film = { canvas, r, scene, camera, w: 0, h: 0 };
    }
    this.vignettes[kind] ||= vignette(kind);
    for (const v of Object.values(this.vignettes)) v.group.visible = false;
    const v = this.vignettes[kind];
    if (!v.group.parent) this.film.scene.add(v.group);
    if (this.film.canvas.parentNode !== el) el.append(this.film.canvas);
    this.shown = { kind, el, v };
  }

  setPulse(key, on) {
    const it = this.items.get(key);
    if (it) it.pulsing = on;
  }

  // A telephone's bell: two short bursts of shaking, then a pause, from the moment it starts.
  setRing(key, on) {
    const it = this.items.get(key);
    if (!it || !!it.ringAt === on) return;
    it.ringAt = on ? this.time || 1e-6 : 0;
  }

  update(dt) {
    if (!this.on) return;
    this.time += dt;
    for (const it of this.items.values()) {
      const el = it.el;
      const r = el.isConnected && el.offsetParent !== null ? el.getBoundingClientRect() : null;
      if (!r || r.width < 2) {
        it.root.visible = false;
        continue;
      }
      it.root.visible = true;
      it.t += dt;
      it.hover += (it.hoverTo - it.hover) * (1 - Math.exp(-dt * 14));
      it.press *= Math.exp(-dt * 9);
      const pulse = it.pulsing ? (Math.sin(this.time * 4.2) * 0.5 + 0.5) : 0;
      const px = Math.min(r.width, r.height) * it.size;
      const ph = it.ringAt && !still.matches ? (this.time - it.ringAt) % 2.4 : 9;
      const ring = ph < 0.45 || (ph > 0.65 && ph < 1.1) ? 1 : 0;
      const lift = it.hover * px * 0.14 - it.press * px * 0.08 + pulse * px * 0.07 + ring * px * 0.05;
      it.root.position.set(r.left + r.width / 2, -(r.top + r.height / 2) + lift, 0);
      const s = px * it.k * (1 + it.hover * 0.1 + pulse * 0.05 - it.press * 0.06);
      it.root.scale.setScalar(s);
      it.holder.rotation.set(
        Math.sin(it.t * 0.9) * 0.04 * it.hover - it.press * 0.2,
        Math.sin(it.t * 1.3) * 0.35 * it.hover + Math.sin(it.t * 0.5) * 0.05,
        Math.sin(it.t * 1.1) * 0.03 + ring * Math.sin(this.time * 75) * 0.11,
      );
      const dim = it.state === "dim" ? 0.55 : it.state === "lock" ? 0.68 : 1;
      it.dimK += (dim - it.dimK) * (1 - Math.exp(-dt * 8));
      it.paint.color.setScalar(it.dimK);
      if (it.plane) it.plane.userData.prop.rotation.z += dt * (it.state === "on" ? 4 + it.hover * 26 : 0.4);
    }
    for (const b of this.boards.values()) {
      const r = b.el.offsetParent !== null ? b.el.getBoundingClientRect() : null;
      if (!r || r.width < 2) {
        b.mesh.visible = false;
        continue;
      }
      b.mesh.visible = true;
      if (Math.abs(r.width - b.w) > 0.5 || Math.abs(r.height - b.h) > 0.5) {
        b.w = r.width;
        b.h = r.height;
        b.mesh.geometry.dispose();
        b.mesh.geometry = new RoundedBoxGeometry(r.width, r.height, 18, 2, 5);
        b.tex.repeat.set(r.width / 256, r.height / 256);
      }
      b.mesh.position.set(r.left + r.width / 2, -(r.top + r.height / 2), -120);
    }
    this.vignette(dt);
  }

  vignette(dt) {
    const sh = this.shown;
    if (!sh) return;
    const { v, el } = sh;
    const f = this.film;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (el.offsetParent === null || w < 10 || f.canvas.parentNode !== el) return;
    v.group.visible = true;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (w !== f.w || h !== f.h) {
      f.w = w;
      f.h = h;
      f.r.setPixelRatio(dpr);
      f.r.setSize(w, h, false);
    }
    const s = h / w;
    v.t += dt;
    if (v.kind === "recon") {
      const loop = 3.4;
      const u = (v.t % loop) / loop;
      if (u < v.lastU) v.found = !v.found;
      v.lastU = u;
      v.holder.position.set(-0.75 + u * 1.5, 0.22 + Math.sin(u * 6) * 0.02, 0);
      v.holder.scale.set(1, 1 / s, 1);
      v.plane.userData.prop.rotation.z += dt * 30;
      const drop = u - 0.45;
      v.flare.visible = drop > 0;
      if (drop > 0) {
        v.flare.position.set(-0.75 + 0.45 * 1.5 + drop * 0.35, 0.16 - drop * 0.5, 0.2);
        const c = v.found ? 0x74ff8a : 0xff5a3c;
        v.flare.material.color.setHex(c);
        v.halo.material.color.setHex(c);
        v.halo.scale.setScalar(0.8 + Math.sin(v.t * 30) * 0.15);
        v.flare.scale.set(1, 1 / s, 1);
      }
    } else if (v.kind === "sniper") {
      const loop = 3.2;
      const u = (v.t % loop) / loop;
      v.target.position.x = Math.sin(v.t * 0.7) * 0.05;
      v.target.scale.set(1, 1 / s, 1);
      const hit = u > 0.55;
      const k = hit ? (u - 0.55) / 0.45 : 0;
      v.helmet.position.set(k * 0.5, 0.04 + (hit ? Math.sin(Math.min(1, k * 1.6) * Math.PI) * 0.4 : 0), 0);
      v.helmet.rotation.z = -k * 5;
      v.helmet.visible = k < 0.8;
    } else {
      const loop = 4;
      for (const p of v.puffs) {
        const u = ((v.t / loop + p.at) % 1);
        const m = p.m;
        m.position.set(-0.24 + u * 0.8, -0.14 + Math.sin(u * 3) * 0.2 + u * 0.12, 0.2 + p.at * 0.1);
        const size = 0.04 + u * 0.16;
        m.scale.set(size, size / s, size);
        m.material.opacity = Math.min(1, u * 6) * (1 - u) * 0.95;
      }
    }
    f.r.render(f.scene, f.camera);
  }
}
