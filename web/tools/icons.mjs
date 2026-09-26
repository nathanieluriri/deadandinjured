// Writes static/favicon.svg from the logo's own outlines, with the skull in block 4's slot.
// The PNG icons come from the live 3D logo: tools/logo-shots.mjs.
import { readFileSync, writeFileSync } from "node:fs";
import * as THREE from "three";
import { skullShape } from "../src/client/scene/symbols.js";

const GEO = JSON.parse(readFileSync(new URL("../src/client/scene/logo-geometry.json", import.meta.url)));
const f = (n) => Math.round(n * 1000) / 1000;
const ring = (pts) => `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join("L")}Z`;
const blocks = GEO.blocks.map((b) => ring(b.outer) + b.holes.map(ring).join("")).join("");
const [cx, cy] = GEO.blocks[3].center;
const k = 0.26;
const shape = skullShape();
const pts = (list) => list.map((p) => [cx + p.x * k, cy - p.y * k]);
const { shape: outer, holes } = shape.extractPoints(12);
const skull = ring(pts(outer)) + holes.map((h) => ring(pts(h))).join("");
const pad = 0.14;
const w = GEO.aspect;
const box = [-pad - (1 - w) / 2, -pad, 1 + 2 * pad, 1 + 2 * pad].map(f).join(" ");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}"><rect x="${f(-pad - (1 - w) / 2)}" y="${-pad}" width="${1 + 2 * pad}" height="${1 + 2 * pad}" rx="0.22" fill="#0c0d12"/><path fill="#f1ece6" fill-rule="evenodd" d="${blocks}"/><path fill="#e0442a" fill-rule="evenodd" d="${skull}"/></svg>\n`;
writeFileSync(new URL("../static/favicon.svg", import.meta.url), svg);
console.log("favicon.svg", svg.length, "bytes");

// The flat mark for light backgrounds (the portfolio film's eyebrow): ink blocks, red skull.
const glyph = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(w)} 1"><path fill="#0e0e0e" fill-rule="evenodd" d="${blocks}"/><path fill="#d8391f" fill-rule="evenodd" d="${skull}"/></svg>\n`;
if (process.argv[2]) {
  writeFileSync(process.argv[2], glyph);
  console.log(process.argv[2], glyph.length, "bytes");
}
