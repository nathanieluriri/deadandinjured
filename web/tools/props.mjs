// Builds models/props.glb: set dressing from Quaternius' Toon Shooter Game Kit (CC0,
// quaternius.com), the kit the soldiers come from. Each prop becomes one mesh with its material
// colours baked into the vertices (some repainted for a dusk battlefield), standing on its origin.
//   node tools/props.mjs path/to/kit/Environment/glTF
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { quantize, meshopt, reorder, weldPrimitive } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import path from "node:path";
import { statSync } from "node:fs";

const dir = process.argv[2];
if (!dir) throw new Error("usage: node tools/props.mjs path/to/Environment/glTF");
const out = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../models/props.glb");

const PROPS = {
  sacks: ["SackTrench", { Sack: 0x75664a }],
  sacksSmall: ["SackTrench_Small", { Sack: 0x6f6046 }],
  crate: ["Crate", { Wood: 0x7a5431, Wood_Light: 0x9c7445 }],
  barrel: ["ExplodingBarrel", { Red: 0x7e3326, Grey: 0x5d6068, White: 0xc9c2ae }],
  pallet: ["Pallet", { Wood: 0x6f4d2f }],
  palletBroken: ["Pallet_Broken", { Wood: 0x654529, Wood_Light: 0x86613b }],
  mine: ["Landmine", { DarkGrey: 0x26262a, Red: 0x8c2e22, Grey: 0x5d6068 }],
  medkit: ["Health", { Green: 0x46562f, White: 0xd9d2bf, DarkGreen: 0xd9d2bf }],
  can: ["GasCan", { Red: 0x6e3a25, DarkRed: 0xb99c6b, Black: 0x1d1d1f }],
  debris: ["Debris_Pile", { Wood: 0x5c3f27, Grey: 0x55575d, Red: 0x6e2b22 }],
  tank: ["Tank", { Grey: 0x4a4b4e, Tank_Main: 0x4d5433, Tank_Main2: 0x5a623c, "Black.001": 0x19191a }],
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene("props");
const material = doc.createMaterial("props");

const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255].map((v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
});

for (const [name, [file, paint]] of Object.entries(PROPS)) {
  const src = await io.read(path.join(dir, `${file}.gltf`));
  const pos = [], nor = [], col = [], idx = [];
  for (const node of src.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const mat = prim.getMaterial();
      const rgb = paint[mat.getName()] !== undefined ? hex(paint[mat.getName()]) : mat.getBaseColorFactor().slice(0, 3);
      const P = prim.getAttribute("POSITION");
      const N = prim.getAttribute("NORMAL");
      const base = pos.length / 3;
      const p = [], n = [];
      for (let i = 0; i < P.getCount(); i++) {
        P.getElement(i, p);
        N.getElement(i, n);
        pos.push(m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]);
        const t = [m[0] * n[0] + m[4] * n[1] + m[8] * n[2], m[1] * n[0] + m[5] * n[1] + m[9] * n[2], m[2] * n[0] + m[6] * n[1] + m[10] * n[2]];
        const l = Math.hypot(...t) || 1;
        nor.push(t[0] / l, t[1] / l, t[2] / l);
        col.push(...rgb.map((v) => Math.round(v * 255)));
      }
      for (const i of prim.getIndices().getArray()) idx.push(base + i);
    }
  }
  let minY = Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    minX = Math.min(minX, pos[i]); maxX = Math.max(maxX, pos[i]);
    minY = Math.min(minY, pos[i + 1]);
    minZ = Math.min(minZ, pos[i + 2]); maxZ = Math.max(maxZ, pos[i + 2]);
  }
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] -= cx;
    pos[i + 1] -= minY;
    pos[i + 2] -= cz;
  }
  const acc = (type, array, norm = false) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer).setNormalized(norm);
  const prim = doc.createPrimitive()
    .setAttribute("POSITION", acc("VEC3", new Float32Array(pos)))
    .setAttribute("NORMAL", acc("VEC3", new Float32Array(nor)))
    .setAttribute("COLOR_0", acc("VEC3", new Uint8Array(col), true))
    .setIndices(acc("SCALAR", new Uint16Array(idx)))
    .setMaterial(material);
  weldPrimitive(prim);
  scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim)));
}

await doc.transform(
  reorder({ encoder: MeshoptEncoder, target: "size" }),
  quantize({ quantizePosition: 12, quantizeNormal: 8, quantizeColor: 8 }),
  meshopt({ encoder: MeshoptEncoder, level: "high" }),
);
await io.write(out, doc);
for (const m of doc.getRoot().listMeshes()) {
  const p = m.listPrimitives()[0];
  console.log(m.getName().padEnd(13), String(p.getIndices().getCount() / 3).padStart(5), "tris", String(p.getAttribute("POSITION").getCount()).padStart(5), "verts");
}
console.log(`${path.relative(process.cwd(), out)} ${statSync(out).size} bytes`);
