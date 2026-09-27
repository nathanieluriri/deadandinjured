import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// The supply draw's hands and picks, toy-like to sit with the soldiers. Every piece carries its
// colour in its vertices so one material draws a whole hand.
const SKIN = 0xc68e5a;
const METAL = 0x9aa0a8;
const INK = 0x3a3431;

function tint(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute("uv");
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

const join = (parts) => mergeGeometries(parts.map(([g, hex]) => tint(g, hex)));

// A fist seen from the thumb side, forearm running off to -x, knuckles toward +x.
function fist(sleeve) {
  const parts = [
    [new RoundedBoxGeometry(0.62, 0.56, 0.52, 3, 0.17), SKIN],
    [new THREE.CylinderGeometry(0.25, 0.28, 0.5, 16).rotateZ(Math.PI / 2).translate(-0.5, -0.02, 0), SKIN],
    [new THREE.CylinderGeometry(0.33, 0.33, 0.62, 18).rotateZ(Math.PI / 2).translate(-0.98, -0.02, 0), sleeve],
    [new THREE.TorusGeometry(0.33, 0.055, 8, 22).rotateY(Math.PI / 2).translate(-0.68, -0.02, 0), sleeve],
    [new THREE.CapsuleGeometry(0.1, 0.34, 4, 10).rotateZ(Math.PI / 2 - 0.25).translate(0.08, 0.22, 0.22), SKIN],
  ];
  for (let i = 0; i < 4; i++) {
    const z = -0.2 + i * 0.135;
    parts.push([new THREE.CapsuleGeometry(0.075, 0.2, 4, 8).translate(0.31, 0.02 - i * 0.02, z), SKIN]);
    parts.push([new THREE.SphereGeometry(0.085, 10, 8).translate(0.27, 0.19 - i * 0.015, z), SKIN]);
  }
  return join(parts);
}

function rock(color) {
  const g = new THREE.IcosahedronGeometry(0.72, 2);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 5.1 + v.y * 3.3) * Math.cos(v.z * 4.2 - v.x * 2.1);
    v.multiplyScalar(0.84 + n * 0.1 + Math.abs(Math.sin(v.x * 9.7 + v.z * 6.1)) * 0.07);
    v.y *= 0.82;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  const out = g.toNonIndexed();
  out.computeVertexNormals();
  const c = new THREE.Color(color);
  const col = new Float32Array(out.attributes.position.count * 3);
  const t = new THREE.Color();
  for (let i = 0; i < col.length; i += 9) {
    t.copy(c).multiplyScalar(0.78 + Math.random() * 0.3);
    for (let k = 0; k < 9; k += 3) col.set([t.r, t.g, t.b], i + k);
  }
  out.setAttribute("color", new THREE.BufferAttribute(col, 3));
  out.deleteAttribute("uv");
  return out;
}

// A sheet of orders: ruled lines, a band in the side's colour, a corner folded over.
function paper(color) {
  const w = 1.1;
  const h = 1.44;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, -h / 2);
  shape.lineTo(w / 2, -h / 2);
  shape.lineTo(w / 2, h / 2 - 0.26);
  shape.lineTo(w / 2 - 0.26, h / 2);
  shape.lineTo(-w / 2, h / 2);
  const sheet = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false }).translate(0, 0, -0.015);
  const fold = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(w / 2, h / 2 - 0.26, 0.02), new THREE.Vector3(w / 2 - 0.26, h / 2, 0.02), new THREE.Vector3(w / 2 - 0.26, h / 2 - 0.26, 0.03),
  ]);
  fold.computeVertexNormals();
  const parts = [[sheet, 0xf1ebdf], [fold, 0xd6cdbd], [new THREE.BoxGeometry(w - 0.3, 0.16, 0.02).translate(-0.1, h / 2 - 0.2, 0.02), color]];
  for (let i = 0; i < 5; i++) parts.push([new THREE.BoxGeometry(i === 4 ? 0.5 : 0.78, 0.035, 0.01).translate(i === 4 ? -0.14 : 0, 0.18 - i * 0.2, 0.02), INK]);
  const g = join(parts);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + Math.sin(p.getX(i) * 2.2) * 0.1 + Math.sin(p.getY(i) * 1.6) * 0.05);
  g.computeVertexNormals();
  return g;
}

// One half of the scissors: a tapering steel blade and a ring handle in the side's colour.
function blade(color) {
  const s = new THREE.Shape();
  s.moveTo(-0.07, 0);
  s.lineTo(0.08, 0);
  s.quadraticCurveTo(0.09, 0.7, 0.012, 1.3);
  s.lineTo(-0.02, 1.3);
  s.quadraticCurveTo(-0.07, 0.6, -0.07, 0);
  const steel = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1 }).translate(0, -0.05, -0.02);
  return join([
    [steel, METAL],
    [new THREE.TorusGeometry(0.2, 0.06, 8, 20).scale(1, 1.25, 1).translate(0.02, -0.36, 0), color],
    [new THREE.CylinderGeometry(0.04, 0.04, 0.1, 10).rotateX(Math.PI / 2).translate(0, 0.02, 0.03), INK],
  ]);
}

export function buildRps(scene, sides) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 });
  const make = (side) => {
    const color = sides[side].clay;
    const r = new THREE.Mesh(rock(color), mat);
    const p = new THREE.Mesh(paper(color), mat);
    const geo = blade(color);
    const scissors = new THREE.Group();
    const b1 = new THREE.Mesh(geo, mat);
    const b2 = new THREE.Mesh(geo, mat);
    b1.rotation.z = 0.32;
    b2.rotation.z = -0.32;
    b2.rotation.y = Math.PI;
    scissors.add(b1, b2);
    const f = new THREE.Mesh(fist(color), mat);
    if (side === "opp") f.rotation.y = Math.PI;
    const g = new THREE.Group();
    for (const o of [r, p, scissors, f]) {
      o.visible = false;
      g.add(o);
    }
    g.visible = false;
    scene.add(g);
    return { group: g, rock: r, paper: p, scissors, fist: f, blades: [b1, b2] };
  };
  return { me: make("me"), opp: make("opp") };
}
