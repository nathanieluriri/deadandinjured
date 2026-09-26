import * as THREE from "three";
import { Font } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import fontData from "./title-font.json";
import { SIDES, COLORS } from "./palette.js";

const font = new Font(fontData);
const cache = new Map();

export function glyph(ch, size = 1, depth = 0.32) {
  const key = `${ch}|${size}|${depth}`;
  if (cache.has(key)) return cache.get(key);
  const g = new TextGeometry(ch, {
    font, size, depth, curveSegments: 4,
    bevelEnabled: true, bevelThickness: depth * 0.18, bevelSize: size * 0.025, bevelSegments: 2,
  });
  g.computeBoundingBox();
  const b = g.boundingBox;
  g.userData.width = font.data.glyphs[ch] ? (font.data.glyphs[ch].ha / font.data.resolution) * size : size * 0.5;
  g.translate(-(b.max.x + b.min.x) / 2, -(b.max.y + b.min.y) / 2, -depth / 2);
  cache.set(key, g);
  return g;
}

// A line of 3D letters, one mesh per letter so each can move on its own.
export function word(text, { size = 1, depth = 0.32, material, tracking = 0.02 }) {
  const group = new THREE.Group();
  const letters = [];
  let x = 0;
  const adv = [];
  for (const ch of text) {
    if (ch === " ") {
      x += size * 0.32;
      continue;
    }
    const g = glyph(ch, size, depth);
    const w = g.userData.width;
    adv.push([ch, x + w / 2, g]);
    x += w + size * tracking;
  }
  const total = x - size * tracking;
  for (const [ch, cx, g] of adv) {
    const m = new THREE.Mesh(g, material);
    m.position.x = cx - total / 2;
    m.userData.home = m.position.clone();
    m.userData.ch = ch;
    group.add(m);
    letters.push(m);
  }
  group.userData.width = total;
  return { group, letters, width: total };
}

export const clay = (hex, rough = 0.5) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0 });

// The four blocks that carry a side's secret code: yours sit on the ammo crate behind your
// squad, the enemy's only rise out of their trench when the match ends.
export class CodeBlocks {
  constructor(scene, side) {
    this.side = side;
    const sd = SIDES[side];
    this.group = new THREE.Group();
    this.group.position.set(0, 0, sd.z + sd.dir * 4.2);
    const wood = new THREE.MeshStandardMaterial({ color: COLORS.wood, roughness: 0.85 });
    const crate = new THREE.Mesh(new RoundedBoxGeometry(3.3, 0.7, 1.05, 2, 0.06), wood);
    crate.position.y = 0.35;
    this.crate = crate;
    this.group.add(crate);
    const blockMat = clay(sd.clay, 0.45);
    this.inkMat = clay(side === "me" ? COLORS.ink : 0xf5efe4, 0.4);
    this.blocks = [];
    const geo = new RoundedBoxGeometry(0.66, 0.66, 0.66, 3, 0.1);
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(geo, blockMat);
      b.position.set(-1.14 + i * 0.76, 1.03, 0);
      b.userData.home = b.position.clone();
      const d = new THREE.Mesh(glyph("0", 0.4, 0.09), this.inkMat);
      d.position.set(0, 0, 0.35);
      d.visible = false;
      b.add(d);
      b.userData.digit = d;
      b.scale.setScalar(0.0001);
      this.group.add(b);
      this.blocks.push(b);
    }
    this.digits = ["", "", "", ""];
    scene.add(this.group);
  }

  set(i, ch) {
    const b = this.blocks[i];
    const d = b.userData.digit;
    this.digits[i] = ch || "";
    if (!ch) {
      d.visible = false;
      return;
    }
    d.geometry = glyph(ch, 0.4, 0.09);
    d.visible = true;
  }
}
