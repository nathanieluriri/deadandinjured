import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { SIDES, COLORS, groundHeight } from "./palette.js";

// A white flag: a rag tied to a length of timber, pushed up from behind a side's sandbags when
// it gives in.
function rag() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 96;
  const x = c.getContext("2d");
  x.fillStyle = "#ece6d8";
  x.fillRect(0, 0, 128, 96);
  for (let i = 0; i < 14; i++) {
    const g = x.createRadialGradient(Math.random() * 128, Math.random() * 96, 0, Math.random() * 128, Math.random() * 96, 10 + Math.random() * 30);
    g.addColorStop(0, "rgba(110, 90, 60, 0.18)");
    g.addColorStop(1, "rgba(110, 90, 60, 0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 96);
  }
  x.fillStyle = "rgba(90, 70, 45, 0.35)";
  for (let i = 0; i < 400; i++) x.fillRect(Math.random() * 128, Math.random() * 96, 1, 1);
  // A frayed edge at the fly end.
  x.globalCompositeOperation = "destination-out";
  for (let y = 0; y < 96; y += 6) x.fillRect(120 + Math.random() * 8, y, 8, 3 + Math.random() * 3);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class WhiteFlag {
  constructor(scene, side) {
    const sd = SIDES[side];
    this.side = side;
    this.group = new THREE.Group();
    const x = side === "me" ? -2 : 2;
    const z = sd.z - sd.dir * 0.75;
    this.home = new THREE.Vector3(x, groundHeight(x, z), z);
    this.group.position.copy(this.home);
    const wood = new THREE.MeshStandardMaterial({ color: COLORS.wood, roughness: 0.85 });
    const pole = new THREE.Mesh(mergeGeometries([
      new THREE.CylinderGeometry(0.04, 0.05, 3.1, 6).translate(0, 1.55, 0),
      new THREE.BoxGeometry(0.14, 0.06, 0.06).translate(0, 2.7, 0),
    ]), wood);
    this.cloth = new THREE.Mesh(
      new THREE.PlaneGeometry(1.05, 0.7, 12, 6).translate(0.525, 0, 0),
      new THREE.MeshStandardMaterial({ map: rag(), roughness: 0.95, side: THREE.DoubleSide, transparent: true, alphaTest: 0.5 }),
    );
    this.cloth.position.y = 2.62;
    this.cloth.rotation.y = sd.dir > 0 ? 0 : Math.PI;
    this.base = Float32Array.from(this.cloth.geometry.attributes.position.array);
    this.group.add(pole, this.cloth);
    this.group.visible = false;
    this.rise = 0;
    this.time = Math.random() * 10;
    scene.add(this.group);
  }

  // 0 is hidden behind the sandbags, 1 is held up high.
  update(dt) {
    if (!this.group.visible) return;
    this.time += dt;
    const k = this.rise;
    this.group.position.y = this.home.y - 3.2 + k * 3.2 + Math.sin(this.time * 2.2) * 0.04 * k;
    this.group.rotation.z = Math.sin(this.time * 1.7) * 0.07 * k + (1 - k) * 0.2;
    const a = this.cloth.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const bx = this.base[i * 3];
      const by = this.base[i * 3 + 1];
      const f = bx / 1.05;
      a.setZ(i, Math.sin(bx * 3.8 - this.time * 6.5) * 0.18 * f + Math.sin(by * 5 + this.time * 4) * 0.05 * f);
      a.setY(i, by - f * f * 0.12);
    }
    a.needsUpdate = true;
    this.cloth.geometry.computeVertexNormals();
  }

  reset() {
    this.rise = 0;
    this.group.visible = false;
  }
}
