import * as THREE from "three";
import { K, tint, join, box, cyl } from "./kit.js";

// The pieces a breastwork trench is built from, in the soldiers' clay style: sandbags, timber
// and corrugated iron revetments, duckboards, doorways, lanterns. Each returns one geometry with
// vertex colours so a whole stretch of trench merges into a few meshes.
const PI = Math.PI;
const T = {
  sack: 0x75664a, sackDark: 0x5f5139, sackLight: 0x8a7a58,
  post: 0x5a3f27, plank: 0x6f4d2f, plankLight: 0x86613b, board: 0x7a5a38,
  iron: 0x5b5a55, ironRust: 0x6e4a33, canvas: 0x8c8466, canvasDark: 0x6c6650,
  brush: 0x5e4b2e, mud: 0x3f2d1f,
};

// A tiny seeded random, so a stretch of wall looks the same on every load.
export function seeded(seed = 1) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

// One sandbag: a stuffed pillow, squared at the ends and bulging in the middle.
const sackGeo = (() => {
  const g = box(0.56, 0.2, 0.34, 0.08);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const k = 1 - Math.pow(Math.abs(x) / 0.28, 2) * 0.35;
    p.setY(i, p.getY(i) * (0.8 + 0.35 * k));
    p.setZ(i, p.getZ(i) * (0.85 + 0.2 * k));
  }
  g.computeVertexNormals();
  return g;
})();

// Courses of sandbags laid in stretcher bond along x, `len` long and `rows` high.
export function sandbagWall(len, rows = 3, rnd = seeded(len * 97 + rows)) {
  const parts = [];
  const bagW = 0.6;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? bagW / 2 : 0;
    const n = Math.ceil((len - off) / bagW);
    for (let i = 0; i < n; i++) {
      const x = -len / 2 + off + bagW / 2 + i * bagW;
      if (x > len / 2) continue;
      const shade = [T.sack, T.sackDark, T.sackLight][Math.floor(rnd() * 3)];
      const g = sackGeo.clone();
      g.rotateY((rnd() - 0.5) * 0.12).rotateZ((rnd() - 0.5) * 0.08);
      g.scale(0.95 + rnd() * 0.1, 1, 1);
      g.translate(x + (rnd() - 0.5) * 0.04, 0.1 + r * 0.19, (rnd() - 0.5) * 0.05);
      parts.push([g, shade]);
    }
  }
  return join(parts);
}

// Timber revetment: posts driven in every metre and planks laid behind them.
export function plankWall(len, h = 1.3) {
  const parts = [];
  const posts = Math.max(2, Math.round(len) + 1);
  for (let i = 0; i < posts; i++) {
    const x = -len / 2 + (len * i) / (posts - 1);
    parts.push([box(0.12, h + 0.15, 0.12, 0.02).translate(x, (h + 0.15) / 2, 0.08), T.post]);
  }
  const rows = Math.round(h / 0.22);
  for (let r = 0; r < rows; r++) {
    const c = r % 3 === 1 ? T.plankLight : T.plank;
    parts.push([box(len, 0.2, 0.05, 0.01).rotateZ((r % 2 ? 1 : -1) * 0.006).translate(0, 0.11 + r * 0.22, 0), c]);
  }
  return join(parts);
}

// A sheet of corrugated iron standing as a revetment or lying as a roof.
export function ironSheet(w = 1.8, h = 1.1, rust = 0.5) {
  const seg = 24;
  const g = new THREE.PlaneGeometry(w, h, seg, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) / w) * seg * PI) * 0.025);
  g.computeVertexNormals();
  const c = new THREE.Color(T.iron);
  const r = new THREE.Color(T.ironRust);
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const k = Math.min(1, Math.max(0, rust * (0.6 + 0.8 * Math.sin(p.getX(i) * 3.1 + p.getY(i) * 5.3))));
    const m = c.clone().lerp(r, k);
    col.set([m.r, m.g, m.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const back = g.clone().rotateY(PI);
  return join([[g, 0], [back, 0]]);
}

// A duckboard: two runners and slats across, to keep boots out of the mud.
export function duckboard(len = 2, w = 0.7) {
  const parts = [];
  for (const s of [-1, 1]) parts.push([box(len, 0.08, 0.08, 0.015).translate(0, 0.04, s * (w / 2 - 0.08)), T.post]);
  const n = Math.round(len / 0.16);
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + 0.08 + i * (len / n);
    parts.push([box(0.1, 0.03, w, 0.01).translate(x, 0.095, 0), i % 4 === 2 ? T.plankLight : T.board]);
  }
  return join(parts);
}

// A dugout's entrance: a timber frame with a lintel, and the gas curtain hung across it,
// drawn aside.
export function doorway(w = 1.1, h = 1.7) {
  const parts = [
    [box(0.16, h, 0.16, 0.02).translate(-w / 2, h / 2, 0), T.post],
    [box(0.16, h, 0.16, 0.02).translate(w / 2, h / 2, 0), T.post],
    [box(w + 0.5, 0.18, 0.2, 0.02).translate(0, h + 0.09, 0), T.post],
  ];
  // The curtain, gathered to one side in folds.
  for (let i = 0; i < 4; i++) {
    parts.push([box(0.12, h - 0.15, 0.06, 0.02).rotateY(0.3 * (i % 2 ? 1 : -1)).translate(-w / 2 + 0.14 + i * 0.09, (h - 0.15) / 2 + 0.05, 0.05), i % 2 ? T.canvas : T.canvasDark]);
  }
  parts.push([cyl(0.02, 0.02, w + 0.1, 6).rotateZ(PI / 2).translate(0, h - 0.05, 0.08), K.metal]);
  return join(parts);
}

// A trench lantern: a brass frame round a glass chimney. The glass is a separate geometry so it
// can glow.
export function lantern() {
  const frame = join([
    [cyl(0.09, 0.1, 0.03, 12).translate(0, 0, 0), K.brassDark],
    [cyl(0.07, 0.09, 0.06, 12).translate(0, 0.3, 0), K.brassDark],
    [new THREE.TorusGeometry(0.06, 0.012, 6, 14).rotateX(PI / 2).translate(0, 0.37, 0), K.brass],
    ...[0, 1, 2, 3].map((i) => [box(0.015, 0.26, 0.015, 0.005).translate(Math.cos((i * PI) / 2) * 0.085, 0.15, Math.sin((i * PI) / 2) * 0.085), K.brass]),
  ]);
  const glass = tint(new THREE.CylinderGeometry(0.06, 0.07, 0.24, 12).translate(0, 0.15, 0), 0xffd08a);
  return { frame, glass };
}

// A brazier: an iron drum on legs, punched with holes, with coals glowing in the top.
export function brazier() {
  const body = join([
    [cyl(0.24, 0.2, 0.42, 14, true).translate(0, 0.45, 0), K.iron],
    ...[0, 1, 2].map((i) => [box(0.04, 0.3, 0.04, 0.01).rotateZ(0.15).rotateY((i * 2 * PI) / 3).translate(Math.cos((i * 2 * PI) / 3) * 0.2, 0.15, Math.sin((i * 2 * PI) / 3) * 0.2), K.metal]),
  ]);
  const coals = tint(new THREE.IcosahedronGeometry(0.19, 1).scale(1, 0.35, 1).translate(0, 0.66, 0), 0xff7a2a);
  return { body, coals };
}

// An A-frame: the timber that holds a trench's walls apart and carries its duckboards.
export function aFrame(w = 1.4, h = 1.5) {
  return join([
    [box(0.1, h * 1.05, 0.1, 0.02).rotateZ(0.2).translate(-w / 2 + 0.1, h / 2, 0), T.post],
    [box(0.1, h * 1.05, 0.1, 0.02).rotateZ(-0.2).translate(w / 2 - 0.1, h / 2, 0), T.post],
    [box(w, 0.1, 0.1, 0.02).translate(0, h * 0.28, 0), T.post],
  ]);
}

export const TRENCH_COLOURS = T;
