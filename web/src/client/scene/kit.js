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
export const box = (w, h, d, r = 0.02) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
export const cyl = (a, b, h, n = 16) => new THREE.CylinderGeometry(a, b, h, n);
const PI = Math.PI;

// A field telephone of the period: a wooden case, a crank on the side, two brass bells on the
// front and the handset lying across its hooks on top.
export function fieldPhone() {
  const parts = [
    [box(0.9, 0.62, 0.58, 0.05).translate(0, 0.31, 0), K.woodDark],
    [box(0.92, 0.08, 0.6, 0.03).translate(0, 0.64, 0), K.wood],
    [box(0.6, 0.3, 0.02, 0.01).translate(0, 0.3, 0.3), K.leatherDark],
    ...[-0.16, 0.16].map((x) => [new THREE.SphereGeometry(0.11, 14, 8, 0, PI * 2, 0, PI / 2).rotateX(PI / 2).translate(x, 0.4, 0.3), K.brass]),
    [cyl(0.015, 0.015, 0.14, 6).rotateX(PI / 2).translate(0, 0.46, 0.34), K.brassDark],
    [cyl(0.05, 0.05, 0.06, 10).rotateZ(PI / 2).translate(0.48, 0.34, 0), K.metal],
    [box(0.04, 0.34, 0.05, 0.015).translate(0.52, 0.2, 0), K.metal],
    [cyl(0.04, 0.04, 0.12, 8).rotateZ(PI / 2).translate(0.57, 0.04, 0), K.woodLight],
    ...[-0.28, 0.28].map((x) => [box(0.05, 0.12, 0.05, 0.015).translate(x, 0.73, 0), K.metal]),
    // the handset: an earpiece and a mouthpiece on a curved grip
    [cyl(0.05, 0.05, 0.62, 10).rotateZ(PI / 2).translate(0, 0.83, 0), K.bakelite],
    [cyl(0.1, 0.07, 0.12, 14).translate(-0.34, 0.8, 0), K.bakelite],
    [cyl(0.09, 0.06, 0.14, 14).rotateZ(-0.5).translate(0.34, 0.8, 0.02), K.bakelite],
  ];
  // The cord, coiled from the handset down the side.
  for (let i = 0; i < 7; i++) parts.push([new THREE.TorusGeometry(0.04, 0.012, 5, 10).rotateY(PI / 2).translate(-0.47, 0.72 - i * 0.07, 0.12), K.dark]);
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
