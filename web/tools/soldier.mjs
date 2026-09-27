// Builds models/soldier.glb from Character_Soldier.gltf in Quaternius' Toon Shooter Game Kit (CC0,
// quaternius.com): one skinned body carrying the head, hood and shoulder pads, a helmet and a
// rifle that come off, and the clips the game plays. Every vertex keeps its source material as a
// part number, so the game paints each side's uniform at load.
//   node tools/soldier.mjs path/to/Character_Soldier.gltf
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { prune, resample, weldPrimitive, simplifyPrimitive, compactPrimitive, quantize, reorder, meshopt, dedup } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import path from "node:path";
import { statSync } from "node:fs";

const src = process.argv[2];
if (!src) throw new Error("usage: node tools/soldier.mjs path/to/Character_Soldier.gltf");
const out = process.argv.find((a) => a.endsWith(".glb")) || path.resolve(path.dirname(new URL(import.meta.url).pathname), "../models/soldier.glb");

const CLIPS = ["Idle", "Idle_Shoot", "Duck", "HitReact", "Death", "Wave", "No", "Jump_Idle", "Jump_Land"];
const PART = {
  body: { Skin: 0, DarkGrey: 1, Pants: 2, Character_Main: 3, Black: 4 },
  hood: 5,
  pads: 6,
  helmet: { Grey: 7, Character_Main: 8 },
  rifle: { Grey: 9, Grey2: 10, Wood: 11, DarkGrey: 12 },
};

const mul = (a, b) => {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
};
const invert = (m) => {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  const d = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
  return [
    (a11 * b11 - a12 * b10 + a13 * b09) * d, (a02 * b10 - a01 * b11 - a03 * b09) * d, (a31 * b05 - a32 * b04 + a33 * b03) * d, (a22 * b04 - a21 * b05 - a23 * b03) * d,
    (a12 * b08 - a10 * b11 - a13 * b07) * d, (a00 * b11 - a02 * b08 + a03 * b07) * d, (a32 * b02 - a30 * b05 - a33 * b01) * d, (a20 * b05 - a22 * b02 + a23 * b01) * d,
    (a10 * b10 - a11 * b08 + a13 * b06) * d, (a01 * b08 - a00 * b10 - a03 * b06) * d, (a30 * b04 - a31 * b02 + a33 * b00) * d, (a21 * b02 - a20 * b04 - a23 * b00) * d,
    (a11 * b07 - a10 * b09 - a12 * b06) * d, (a00 * b09 - a01 * b07 + a02 * b06) * d, (a31 * b01 - a30 * b03 - a32 * b00) * d, (a20 * b03 - a21 * b01 + a22 * b00) * d,
  ];
};
const point = (m, [x, y, z]) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
const normal = (m, [x, y, z]) => {
  const i = invert(m);
  const v = [i[0] * x + i[1] * y + i[2] * z, i[4] * x + i[5] * y + i[6] * z, i[8] * x + i[9] * y + i[10] * z];
  const l = Math.hypot(...v) || 1;
  return v.map((c) => c / l);
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(src);
const root = doc.getRoot();
const buffer = root.listBuffers()[0];
const named = (name, withMesh) => root.listNodes().find((n) => n.getName() === name && !!n.getMesh() === withMesh);
const bodyNode = named("Body", true);
const skin = bodyNode.getSkin();
const joints = skin.listJoints();
const ibm = (joint) => {
  const m = new Array(16);
  skin.getInverseBindMatrices().getElement(joints.indexOf(joint), m);
  return m;
};

// Gathers primitives into flat arrays, carrying rigid parts into the space `toSpace` returns.
function gather(list) {
  const pos = [], nor = [], part = [], idx = [], jnt = [], wgt = [];
  for (const { prim, id, matrix, joint } of list) {
    const base = pos.length / 3;
    const P = prim.getAttribute("POSITION");
    const N = prim.getAttribute("NORMAL");
    const J = prim.getAttribute("JOINTS_0");
    const W = prim.getAttribute("WEIGHTS_0");
    const e = [], f = [];
    for (let i = 0; i < P.getCount(); i++) {
      P.getElement(i, e);
      N.getElement(i, f);
      pos.push(...(matrix ? point(matrix, e) : e));
      nor.push(...(matrix ? normal(matrix, f) : f));
      part.push(id);
      if (J) {
        jnt.push(...J.getElement(i, []));
        wgt.push(...W.getElement(i, []));
      } else if (joint !== undefined) {
        jnt.push(joint, 0, 0, 0);
        wgt.push(1, 0, 0, 0);
      }
    }
    for (const i of prim.getIndices().getArray()) idx.push(base + i);
  }
  return { pos, nor, part, idx, jnt, wgt };
}

const acc = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
const material = doc.createMaterial("soldier");

function primitive({ pos, nor, part, idx, jnt, wgt }, center = [0, 0, 0]) {
  const p = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i++) p[i] = pos[i] - center[i % 3];
  const prim = doc.createPrimitive()
    .setAttribute("POSITION", acc("VEC3", p))
    .setAttribute("NORMAL", acc("VEC3", new Float32Array(nor)))
    .setAttribute("_PART", acc("SCALAR", new Uint8Array(part)))
    .setIndices(acc("SCALAR", new Uint16Array(idx)))
    .setMaterial(material);
  if (jnt.length) {
    prim.setAttribute("JOINTS_0", acc("VEC4", new Uint8Array(jnt)));
    prim.setAttribute("WEIGHTS_0", acc("VEC4", new Float32Array(wgt)));
  }
  return prim;
}

const bounds = (pos) => {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i++) {
    min[i % 3] = Math.min(min[i % 3], pos[i]);
    max[i % 3] = Math.max(max[i % 3], pos[i]);
  }
  return { min, max, center: min.map((v, i) => (v + max[i]) / 2) };
};

// The body: its own skinned primitives, plus the hood and the pads as rigid parts of one bone.
const headNode = named("Head", true);
const rigid = (node) => {
  const bone = node.getParentNode();
  return { matrix: mul(invert(ibm(bone)), node.getMatrix()), joint: joints.indexOf(bone) };
};
const headPrims = headNode.getMesh().listPrimitives();
const bodyList = bodyNode.getMesh().listPrimitives().map((prim) => ({ prim, id: PART.body[prim.getMaterial().getName()] }));
bodyList.push({ prim: headPrims.find((p) => p.getMaterial().getName() === "Black"), id: PART.hood, ...rigid(headNode) });
for (const side of ["L", "R"]) {
  const pad = named(`ShoulderPad.${side}`, true);
  bodyList.push({ prim: pad.getMesh().listPrimitives()[0], id: PART.pads, ...rigid(pad) });
}
const body = primitive(gather(bodyList));
weldPrimitive(body);
simplifyPrimitive(body, { simplifier: MeshoptSimplifier, ratio: 0.6, error: 0.002, lockBorder: false });
compactPrimitive(body);
bodyNode.setName("soldier");
const bodyMesh = doc.createMesh("body").addPrimitive(body);
bodyNode.setMesh(bodyMesh);

// Detachable pieces live in their bone's space, centred on themselves so they tumble true; the
// node carries the offset back to the bone.
function piece(name, node, prims, ratio) {
  const local = node.getMatrix();
  const g = gather(prims.map((prim) => ({ prim, id: PART[name][prim.getMaterial().getName()], matrix: local })));
  const { center } = bounds(g.pos);
  const prim = primitive(g, center);
  weldPrimitive(prim);
  if (ratio < 1) simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio, error: 0.004, lockBorder: false });
  compactPrimitive(prim);
  const n = doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)).setTranslation(center);
  n.setExtras({ bone: node.getParentNode().getName() });
  root.listScenes()[0].addChild(n);
  return n;
}
piece("helmet", headNode, headPrims.filter((p) => p.getMaterial().getName() !== "Black"), 1);
const ak = named("AK", true);
piece("rifle", ak, ak.getMesh().listPrimitives(), 0.45);

for (const n of root.listNodes()) {
  if (n === bodyNode || !n.getMesh() || n.getName() === "helmet" || n.getName() === "rifle") continue;
  n.dispose();
}

// Clips: only what the game plays, without channels that never leave the rest pose or that
// drive the leg pole targets, which move nothing.
for (const anim of root.listAnimations()) {
  if (!CLIPS.includes(anim.getName())) {
    for (const c of anim.listChannels()) c.getSampler().dispose();
    anim.dispose();
    continue;
  }
  for (const c of anim.listChannels()) {
    const node = c.getTargetNode();
    const pathName = c.getTargetPath();
    const rest = pathName === "rotation" ? node.getRotation() : pathName === "translation" ? node.getTranslation() : node.getScale();
    const out = c.getSampler().getOutput().getArray();
    const n = rest.length;
    let still = true;
    for (let i = 0; i < out.length && still; i++) if (Math.abs(out[i] - rest[i % n]) > 2e-4) still = false;
    if (still || node.getName().startsWith("PoleTarget")) {
      const s = c.getSampler();
      c.dispose();
      s.dispose();
    }
  }
}

await doc.transform(
  resample({ tolerance: 2e-4 }),
  prune(),
  dedup(),
  reorder({ encoder: MeshoptEncoder, target: "size" }),
  quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeWeight: 8 }),
);
if (!process.argv.includes("--plain")) await doc.transform(meshopt({ encoder: MeshoptEncoder, level: "high" }));
for (const m of root.listMaterials()) if (m !== material) m.dispose();

await io.write(out, doc);
const tris = root.listMeshes().map((m) => `${m.getName()} ${m.listPrimitives().map((p) => p.getIndices().getCount() / 3).join("+")} tris, ${m.listPrimitives().map((p) => p.getAttribute("POSITION").getCount()).join("+")} verts`);
console.log(tris.join("\n"));
console.log(root.listAnimations().map((a) => `${a.getName()} ${a.listChannels().length}ch`).join(", "));
console.log(`${path.relative(process.cwd(), out)} ${statSync(out).size} bytes, ${joints.length} joints`);
