import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// Small props built in code in the soldiers' clay style: every part carries its colour in its
// vertices, so a whole prop is one mesh and one draw call.
export const K = {
  metal: 0x34343a, dark: 0x1d1c1f, iron: 0x4a4c52, brass: 0xb58d3c, brassDark: 0x7d5f24,
  wood: 0x7a5431, woodLight: 0x9c7445, woodDark: 0x4f3521, leather: 0x5e3822, leatherDark: 0x40261a,
  paper: 0xf0e7d3, cream: 0xefe6d0, ink: 0x2a2520, olive: 0x5d6136, bakelite: 0x231a16, red: 0xb8391f,
};

export function tint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.attributes.uv) g.deleteAttribute("uv");
  if (g.attributes.color) return g;
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

export const join = (parts) => mergeGeometries(parts.map(([g, hex]) => tint(g, hex)));
// A rounded box is slow to build and the same few sizes recur, so each size is built once and copied.
const boxes = new Map();
export const box = (w, h, d, r = 0.02) => {
  const key = `${w} ${h} ${d} ${r}`;
  let g = boxes.get(key);
  if (!g) boxes.set(key, (g = new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001))));
  return g.clone();
};
export const cyl = (a, b, h, n = 16) => new THREE.CylinderGeometry(a, b, h, n);
const PI = Math.PI;

// A field telephone: an olive case with its magneto bell on the front and a crank on the
// side, and a big bakelite handset on the cradle, the shape that says telephone at icon size.
const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const BAKE = 0x552a1a;
const BAKE_DARK = 0x381a10;
const STRAP = 0x40261a;

function handset() {
  const grip = new THREE.CatmullRomCurve3([V(-0.44, 0), V(-0.36, 0.14), V(-0.18, 0.18), V(0.18, 0.18), V(0.36, 0.14), V(0.44, 0)]);
  const bell = [[0.001, -0.08], [0.2, -0.08], [0.215, -0.05], [0.2, 0.01], [0.14, 0.07], [0.07, 0.1], [0.001, 0.11]].map(([x, y]) => new THREE.Vector2(x, y));
  const parts = [[new THREE.TubeGeometry(grip, 36, 0.112, 10, false), BAKE]];
  for (const s of [-1, 1]) {
    const cup = [
      [new THREE.LatheGeometry(bell, 18), BAKE],
      [new THREE.TorusGeometry(0.205, 0.02, 6, 24).rotateX(PI / 2).translate(0, -0.075, 0), K.brass],
      [cyl(0.19, 0.19, 0.01, 22).translate(0, -0.085, 0), BAKE_DARK],
    ];
    for (const [g, c] of cup) parts.push([g.rotateZ(s * 0.12).translate(s * 0.47, -0.05, 0), c]);
  }
  parts.push([cyl(0.122, 0.122, 0.08, 12).rotateZ(PI / 2).translate(0, 0.18, 0), K.brass]);
  return parts;
}

// Built once: the end of a match and the signals dugout both have one.
let phoneGeo = null;
export const fieldPhone = () => (phoneGeo ||= phoneMade()).clone();

function phoneMade() {
  const W = 0.86;
  const H = 0.46;
  const fz = 0.25;
  const top = H + 0.065;
  const by = 0.24;
  const parts = [
    [box(W, H, 0.5, 0.05).translate(0, H / 2, 0), K.olive],
    [box(W + 0.06, 0.07, 0.56, 0.03).translate(0, H + 0.03, 0), 0x454828],
    [cyl(0.165, 0.165, 0.03, 24).rotateX(PI / 2).translate(0, by, fz + 0.005), K.cream],
    [new THREE.SphereGeometry(0.12, 18, 10, 0, PI * 2, 0, PI / 2).rotateX(PI / 2).scale(1, 1, 0.75).translate(0, by, fz + 0.02), K.brass],
    [new THREE.TorusGeometry(0.12, 0.018, 6, 22).translate(0, by, fz + 0.022), K.brassDark],
    [cyl(0.022, 0.022, 0.03, 10).rotateX(PI / 2).translate(0, by, fz + 0.1), K.brassDark],
    [cyl(0.011, 0.011, 0.1, 6).translate(0, by + 0.2, fz + 0.05), K.brassDark],
    [new THREE.SphereGeometry(0.03, 8, 6).translate(0, by + 0.14, fz + 0.06), K.brassDark],
    [cyl(0.055, 0.055, 0.07, 12).rotateZ(PI / 2).translate(W / 2 + 0.035, 0.26, 0), K.iron],
    [box(0.045, 0.3, 0.055, 0.015).translate(0, -0.13, 0).rotateX(0.35).translate(W / 2 + 0.08, 0.26, 0), K.iron],
    [cyl(0.048, 0.048, 0.15, 10).rotateZ(PI / 2).translate(W / 2 + 0.16, 0.26 - 0.26 * Math.cos(0.35), -0.26 * Math.sin(0.35)), K.cream],
  ];
  for (const s of [-1, 1]) {
    const x = s * 0.3;
    parts.push([box(0.065, H + 0.02, 0.02, 0.008).translate(x, H / 2, fz + 0.012), STRAP]);
    parts.push([box(0.085, 0.06, 0.028, 0.01).translate(x, H * 0.34, fz + 0.022), K.brassDark]);
    parts.push([box(0.045, 0.026, 0.02, 0.006).translate(x, H * 0.34, fz + 0.034), STRAP]);
    parts.push([new THREE.TorusGeometry(0.038, 0.013, 6, 12).rotateY(PI / 2).translate(s * (W / 2 + 0.012), H - 0.08, -0.16), K.brass]);
    parts.push([box(0.028, H - 0.12, 0.06, 0.01).translate(s * (W / 2 + 0.012), (H - 0.12) / 2, -0.16), STRAP]);
    parts.push([box(0.05, 0.09, 0.05, 0.015).translate(s * 0.27, top + 0.04, 0), K.metal]);
    parts.push([box(0.15, 0.04, 0.07, 0.015).translate(s * 0.27, top + 0.1, 0), K.metal]);
  }
  const m = new THREE.Matrix4().compose(V(0.03, top + 0.23, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.25, 0.15)), V(0.95, 0.95, 0.95));
  for (const [g, c] of handset()) parts.push([g.applyMatrix4(m), c]);
  const a = V(-0.5, -0.1, 0.06).applyMatrix4(m);
  const cord = new THREE.CatmullRomCurve3([a, V(a.x - 0.07, a.y - 0.14, a.z + 0.08), V(-0.56, 0.12, 0.2), V(-0.47, 0.03, 0.2), V(-0.4, 0.14, 0.2)]);
  parts.push([new THREE.TubeGeometry(cord, 14, 0.026, 5, false), K.dark]);
  return join(parts);
}

// A signpost: a stout post with an arrow plank pointing home.
export function signpost() {
  const s = new THREE.Shape();
  s.moveTo(-0.55, -0.13);
  s.lineTo(0.38, -0.13);
  s.lineTo(0.58, 0);
  s.lineTo(0.38, 0.13);
  s.lineTo(-0.55, 0.13);
  const arrow = new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 1 }).translate(0, 0, -0.035);
  const parts = [
    [box(0.12, 1.3, 0.12, 0.03).translate(0, 0.65, 0), K.wood],
    [arrow.clone().rotateZ(0.06).translate(0.1, 1.08, 0.08), K.woodLight],
    [arrow.clone().rotateY(PI).rotateZ(-0.05).translate(-0.08, 0.8, 0.08), K.wood],
    ...[[0.02, 1.1], [-0.02, 0.8]].map(([x, y]) => [cyl(0.018, 0.018, 0.02, 6).rotateX(PI / 2).translate(x, y, 0.13), K.metal]),
    [box(0.3, 0.06, 0.3, 0.02).translate(0, 0.03, 0), K.woodDark],
  ];
  return join(parts);
}
