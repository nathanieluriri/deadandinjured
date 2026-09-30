import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { K, tint, join, box, cyl } from "./kit.js";
import { sandbags, sackGeo, plankWall, ironSheet, duckboard, doorway, lantern, aFrame, seeded, slab, TRENCH_COLOURS as T } from "./trench.js";
import { fieldPhone } from "./kit.js";
import { scope, smoke } from "./icons.js";
import { buildPlane } from "./plane.js";
import { SIDES } from "./palette.js";

// The trench network behind our left flank, where the title lives: the trench corner with the
// banner and the signpost, the notice board, the communication trench back to the war room, the
// signals dugout and the radio post. The ground there is levelled (palette.js networkMask) and
// the walls are built up, breastwork style. Everything static merges into one mesh; the things a
// player touches stay separate so they can move.
const PI = Math.PI;
const calm = matchMedia("(prefers-reduced-motion: reduce)");

// Each place's anchor, in world metres (our line is at z 6, positive z is behind it).
export const PLACES = {
  corner: { x: -14.8, z: 9 },
  board: { x: -17.05, z: 8.9 },
  war: { x: -13.2, z: 19.6 },
  signals: { x: -18.6, z: 15.6 },
  radio: { x: -9.6, z: 25.6 },
};

// Each plank points roughly the way it leads, turned enough to read from the corner.
const SIGNS = [
  { key: "solo", text: "Play the computer", yaw: 0.35, y: 2.3 },
  { key: "friend", text: "Play a friend", yaw: -2.74, y: 2.02 },
  { key: "quick", text: "Quick match", yaw: -0.45, y: 1.74 },
  { key: "board", text: "Leaderboard", yaw: -2.55, y: 1.46 },
  { key: "drill", text: "Tutorials", yaw: 0.05, y: 1.18 },
];

function paint(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const loadImage = (src) => new Promise((ok) => {
  const i = new Image();
  i.onload = () => ok(i);
  i.onerror = () => ok(null);
  i.src = src;
});

// Worn canvas: a weave of fine lines and some weather.
function weave(x, w, h, base) {
  x.fillStyle = base;
  x.fillRect(0, 0, w, h);
  const r = seeded(7);
  for (let i = 0; i < h; i += 3) {
    x.fillStyle = `rgba(60, 45, 25, ${0.03 + r() * 0.04})`;
    x.fillRect(0, i, w, 1);
  }
  for (let i = 0; i < w; i += 3) {
    x.fillStyle = `rgba(255, 250, 235, ${0.02 + r() * 0.03})`;
    x.fillRect(i, 0, 1, h);
  }
  for (let i = 0; i < 18; i++) {
    const px = r() * w;
    const py = r() * h;
    const rad = 30 + r() * 120;
    const g = x.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, `rgba(90, 70, 40, ${0.06 + r() * 0.08})`);
    g.addColorStop(1, "rgba(90, 70, 40, 0)");
    x.fillStyle = g;
    x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }
}

// Stencilled paint: solid letters with the bridges a stencil leaves and a little overspray.
function stencil(x, text, cx, cy, size, colour, { spray = 0.18, font = "Stardos Stencil", max = undefined } = {}) {
  x.save();
  x.font = `700 ${size}px "${font}", "Archivo", sans-serif`;
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillStyle = colour;
  x.shadowColor = colour;
  // A canvas shadow's blur is in device pixels, whatever the drawing is scaled by.
  x.shadowBlur = size * 0.05 * x.getTransform().a;
  x.globalAlpha = spray;
  x.fillText(text, cx + 1.5, cy + 1, max);
  x.globalAlpha = 0.92;
  x.shadowBlur = 0;
  x.fillText(text, cx, cy, max);
  x.restore();
}

export class Network {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = "network";
    scene.add(this.group);
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.glassMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    this.parts = [];
    this.glass = [];
    this.touch = {};
    this.sacks = [];
    this.anchors = {};
    // The objects whose buttons take their shape each frame: a mesh and its long axis, local.
    this.boxes = {};
    this.swing = {};
    this.time = 0;
  }

  // A wall of sandbags, placed and turned: each sack becomes an instance of one mesh.
  bags(len, rows, x, y, z, yaw = 0) {
    const place = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z);
    for (const [m, shade] of sandbags(len, rows)) this.sacks.push([place.clone().multiply(m), shade]);
  }

  // Adds a piece of static geometry, placed and turned, to the merged mesh. The geometry is taken,
  // not copied, so each call needs its own.
  put(geo, x, y, z, yaw = 0, list = this.parts) {
    const g = geo.attributes.color ? geo : tint(geo, T.post);
    g.rotateY(yaw);
    g.translate(x, y, z);
    list.push(g);
  }

  async build() {
    await Promise.race([document.fonts?.load('700 64px "Stardos Stencil"'), new Promise((r) => setTimeout(r, 2000))]);
    const [dead, injured] = await Promise.all([loadImage("/logo-dead.png"), loadImage("/logo-injured.png")]);
    const start = performance.now();
    this.corner();
    this.banner(dead, injured);
    this.signpost();
    this.noticeBoard();
    this.commsTrench();
    this.warRoom();
    this.signals();
    this.radioPost();
    this.plates();
    const merged = mergeGeometries(this.parts.map((g) => (g.index ? g.toNonIndexed() : g)));
    this.walls = new THREE.Mesh(merged, this.mat);
    this.group.add(this.walls);
    if (this.glass.length) {
      this.lights = new THREE.Mesh(mergeGeometries(this.glass), this.glassMat);
      this.group.add(this.lights);
    }
    for (const g of this.parts) g.dispose();
    this.parts = [];
    const sacks = new THREE.InstancedMesh(sackGeo, new THREE.MeshLambertMaterial(), this.sacks.length);
    const shade = new THREE.Color();
    this.sacks.forEach(([m, hex], i) => {
      sacks.setMatrixAt(i, m);
      sacks.setColorAt(i, shade.setHex(hex));
    });
    sacks.computeBoundingSphere();
    this.group.add(sacks);
    this.sacks = [];
    performance.measure("trench", { start });
  }

  // The trench corner: a bay where the trench turns back from the line, with a sandbag
  // parapet toward the enemy, a firestep, timber walls and duckboards.
  corner() {
    const { x, z } = PLACES.corner;
    this.bags(4.8, 6, x - 0.1, 0, z - 2.25);
    this.bags(4.8, 2, x - 0.1, 1.14, z - 2.35);
    this.put(tint(slab(4.4, 0.08, 0.42), T.board), x - 0.1, 0.42, z - 1.8, 0);
    for (const dx of [-2, -0.7, 0.6, 1.9]) this.put(box(0.1, 0.42, 0.1, 0.02), x + dx, 0.21, z - 1.7);
    this.put(plankWall(5.2, 1.3), x - 2.45, 0, z + 0.35, PI / 2);
    this.bags(5.2, 2, x - 2.6, 1.3, z + 0.35, PI / 2);
    // The right side closes with a traverse, a thick block of sandbags the trench turns round.
    this.bags(2.2, 7, x + 2.35, 0, z - 1.1, PI / 2);
    this.bags(2.2, 7, x + 2.75, 0, z - 1.1, PI / 2);
    for (let i = 0; i < 3; i++) this.put(duckboard(1.6, 0.7), x - 1.2 + i * 1.3, 0, z - 0.6, PI / 2);
    this.put(duckboard(2, 0.7), x + 1.2, 0, z + 0.9);
    this.lamp(x + 1.95, 2.25, z - 2.05);
    this.lamp(x - 2.25, 1.45, z + 1.6);
    // The field manual on a crate, and the field radio on the firestep.
    this.anchors.manual = new THREE.Vector3(x - 1.7, 0.66, z + 1.3);
    this.anchors.sound = new THREE.Vector3(x + 1.2, 0.85, z - 1.8);
    this.put(tint(slab(0.62, 0.55, 0.5), 0x7a5431), x - 1.7, 0.28, z + 1.3, 0.2);
    const book = new THREE.Group();
    book.add(new THREE.Mesh(join([[box(0.36, 0.03, 0.26, 0.01), 0x5e3822], [box(0.34, 0.05, 0.24, 0.01).translate(0.005, 0.035, 0), K.paper]]), this.mat));
    this.cover = new THREE.Group();
    this.cover.position.set(-0.18, 0.07, 0);
    this.cover.add(new THREE.Mesh(tint(box(0.36, 0.02, 0.26, 0.008), 0x5e3822).translate(0.18, 0, 0), this.mat));
    book.add(this.cover);
    book.position.set(x - 1.7, 0.57, z + 1.3);
    book.rotation.y = 0.5;
    this.group.add(book);
    this.put(join([
      [box(0.5, 0.34, 0.28, 0.03), 0x4d5433],
      [cyl(0.05, 0.05, 0.03, 12).rotateX(PI / 2).translate(-0.12, 0.04, 0.15), K.brass],
      [cyl(0.05, 0.05, 0.03, 12).rotateX(PI / 2).translate(0.1, 0.04, 0.15), K.brass],
      [cyl(0.008, 0.008, 0.6, 5).translate(0.2, 0.45, -0.08), K.metal],
    ]), x + 1.2, 0.63, z - 1.8, -0.2);
    this.tallyMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.5), new THREE.MeshLambertMaterial({ transparent: true, depthWrite: false, emissive: 0x9a958a }));
    this.tallyMesh.position.set(x + 0.45, 1.36, z - 2.12);
    this.tallyMesh.visible = false;
    this.group.add(this.tallyMesh);
  }

  // The title, stencilled on a canvas banner strung between two poles over the parapet.
  banner(dead, injured) {
    const { x, z } = PLACES.corner;
    const bz = z - 2.1;
    const left = x - 1.95;
    const right = x + 1.75;
    for (const px of [left, right]) {
      this.put(box(0.14, 4, 0.14, 0.03), px, 2, bz);
      this.put(box(0.3, 0.08, 0.08, 0.02), px, 3.7, bz);
    }
    const w = right - left - 0.3;
    // Painted at half size: the banner is never more than about 700 pixels wide on screen.
    const tex = paint(1024, 280, (c) => {
      const W = 2048;
      const H = 560;
      c.scale(0.5, 0.5);
      weave(c, W, H, "#d9ceb2");
      c.strokeStyle = "rgba(60, 45, 25, 0.35)";
      c.lineWidth = 10;
      c.strokeRect(16, 16, W - 32, H - 32);
      stencil(c, "DEAD & INJURED", W / 2, H * 0.53, 230, "#2b241d", { max: W - 640 });
      // The skull and the bandage from the game's logo, stamped at each end.
      const s = 230;
      if (dead) c.drawImage(dead, 196, 212, 60, 68, 90, (H - s) / 2, s * (60 / 68), s);
      if (injured) c.drawImage(injured, 186, 208, 78, 72, W - 90 - s * (78 / 72), (H - s) / 2, s * (78 / 72), s);
    });
    const geo = new THREE.PlaneGeometry(w, w * (560 / 2048), 24, 6);
    this.bannerBase = geo.attributes.position.array.slice();
    const mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, emissive: 0x3a2a1a, emissiveMap: tex, emissiveIntensity: 0.45 });
    this.bannerMesh = new THREE.Mesh(geo, mat);
    this.bannerMesh.position.set((left + right) / 2, 2.95, bz + 0.02);
    this.group.add(this.bannerMesh);
    this.bannerH = w * (560 / 2048);
    this.bannerTop = 2.95 + this.bannerH / 2;
    this.bannerK = 1;
    this.bannerRoll = new THREE.Mesh(tint(cyl(0.05, 0.05, w, 10).rotateZ(PI / 2), 0xcfc3a5), this.mat);
    this.bannerRoll.position.set((left + right) / 2, this.bannerTop, bz + 0.04);
    this.bannerRoll.visible = false;
    this.group.add(this.bannerRoll);
    const rope = new THREE.CatmullRomCurve3([new THREE.Vector3(left, 3.62, bz), new THREE.Vector3((left + right) / 2, 3.5, bz + 0.02), new THREE.Vector3(right, 3.62, bz)]);
    this.parts.push(tint(new THREE.TubeGeometry(rope, 16, 0.015, 4, false), 0xb8a57a));
  }

  // The signpost of nailed planks, one for each way out of the corner.
  signpost() {
    const { x, z } = PLACES.corner;
    const sx = x - 1.05;
    const sz = z + 0.55;
    this.put(box(0.14, 2.7, 0.14, 0.03), sx, 1.35, sz);
    this.put(box(0.3, 0.12, 0.3, 0.02), sx, 0.06, sz);
    const n = SIGNS.length;
    const atlas = paint(1024, 128 * n, (c, W, H) => {
      const r = seeded(3);
      for (let i = 0; i < n; i++) {
        const y = (i * H) / n;
        c.fillStyle = ["#8a6440", "#7a5431", "#946b43", "#80593a", "#8e6843"][i];
        c.fillRect(0, y, W, H / n);
        for (let g = 0; g < 26; g++) {
          c.strokeStyle = `rgba(30, 18, 8, ${0.08 + r() * 0.14})`;
          c.lineWidth = 1 + r() * 2;
          c.beginPath();
          const gy = y + r() * (H / n);
          c.moveTo(0, gy);
          c.bezierCurveTo(W / 3, gy + (r() - 0.5) * 8, (2 * W) / 3, gy + (r() - 0.5) * 8, W, gy + (r() - 0.5) * 6);
          c.stroke();
        }
        stencil(c, SIGNS[i].text.toUpperCase(), W / 2 - 20, y + H / n / 2 + 4, 62, "#efe6d0", { spray: 0.25 });
      }
    });
    const mat = new THREE.MeshLambertMaterial({ map: atlas });
    // Your dog tag, hung on a nail on the post.
    const tag = join([
      [box(0.09, 0.14, 0.01, 0.02), 0xb8b3a6],
      [cyl(0.004, 0.004, 0.22, 4).rotateZ(0.6).translate(-0.03, 0.12, 0), 0x8a857c],
    ]);
    this.put(tag, sx - 0.03, 0.88, sz + 0.075);
    this.anchors.tag = new THREE.Vector3(sx - 0.03, 0.88, sz + 0.08);
    this.signs = SIGNS.map((s, i) => {
      const shape = new THREE.Shape();
      const L = 1.55;
      const Hh = 0.13;
      shape.moveTo(-0.1, -Hh);
      shape.lineTo(L - 0.18, -Hh);
      shape.lineTo(L, 0);
      shape.lineTo(L - 0.18, Hh);
      shape.lineTo(-0.1, Hh);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false });
      geo.translate(0, 0, -0.025);
      // Map the plank's faces onto its row of the atlas.
      const uv = geo.attributes.uv;
      const pos = geo.attributes.position;
      const nor = geo.attributes.normal;
      for (let k = 0; k < uv.count; k++) {
        // The back face reads mirrored unless its u runs the other way.
        const back = nor.getZ(k) < -0.5;
        const u0 = (pos.getX(k) + 0.1) / (L + 0.1);
        const u = back ? 1 - u0 : u0;
        const v = (pos.getY(k) + Hh) / (Hh * 2);
        uv.setXY(k, u, 1 - (i + 1) / n + v / n);
      }
      const plank = new THREE.Mesh(geo, mat);
      const pivot = new THREE.Group();
      pivot.position.set(sx, s.y, sz);
      pivot.rotation.y = s.yaw;
      plank.position.x = 0.02;
      pivot.add(plank);
      this.group.add(pivot);
      this.touch[s.key] = pivot;
      this.boxes[s.key] = { obj: plank, a: new THREE.Vector3(-0.08, 0, 0), b: new THREE.Vector3(L - 0.04, 0, 0), h: Hh };
      this.anchors[s.key] = new THREE.Vector3(0.72, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw).add(pivot.position);
      return { ...s, pivot, plank };
    });
  }

  // The notice board on the corner's left wall, where the leaderboard is pinned.
  noticeBoard() {
    const { x, z } = PLACES.board;
    this.put(tint(slab(0.08, 1.2, 1.7), 0x5a3f27), x, 1.25, z, 0);
    this.put(tint(slab(0.1, 0.1, 1.9), 0x4a3320), x + 0.02, 1.9, z);
    this.put(tint(slab(0.1, 0.1, 1.9), 0x4a3320), x + 0.02, 0.6, z);
    this.boardPaper = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.95), new THREE.MeshLambertMaterial({ color: 0xb9ad90 }));
    this.boardPaper.position.set(x + 0.06, 1.25, z);
    this.boardPaper.rotation.y = PI / 2;
    this.group.add(this.boardPaper);
    this.anchors.roll = new THREE.Vector3(x + 0.06, 1.25, z);
    for (const [dz, ribbon] of [[-0.6, 0x8a2a1a], [0.47, 0x2a4a7a], [0.6, 0x6f6a2a]]) {
      this.put(join([
        [slab(0.012, 0.12, 0.055), ribbon],
        [cyl(0.042, 0.042, 0.012, 14).rotateZ(PI / 2).translate(0.004, -0.095, 0), K.brass],
      ]), x + 0.1, 1.86, z + dz);
    }
  }

  // The communication trench back from the corner to the war room: sandbags on the left,
  // timber on the right, duckboards along the floor and A-frames every few metres.
  commsTrench() {
    const cx = -13.6;
    const z0 = 10.4;
    const z1 = 16.4;
    const len = z1 - z0;
    const mid = (z0 + z1) / 2;
    // The left wall breaks at z 13.4 to 14.8 for the branch to the signals dugout.
    this.bags(3, 6, cx - 0.85, 0, z0 + 1.5, PI / 2);
    this.bags(1.6, 6, cx - 0.85, 0, z1 - 0.8, PI / 2);
    this.put(plankWall(len, 1.2), cx + 0.8, 0, mid, -PI / 2);
    this.bags(len, 2, cx + 0.95, 1.2, mid, PI / 2);
    for (let i = 0; i < 3; i++) this.put(duckboard(2, 0.7), cx, 0, z0 + 1 + i * 2, PI / 2);
    this.put(aFrame(1.5, 1.35), cx, 0, z0 + 2.2);
    this.put(aFrame(1.5, 1.35), cx, 0, z0 + 4.8);
  }

  // A lantern: its frame into the walls, its glass into the glowing mesh.
  lamp(x, y, z) {
    const l = lantern();
    this.put(l.frame, x, y, z);
    this.put(l.glass, x, y, z, 0, this.glass);
  }

  // A dugout: timber walls on four sides with a doorway, a roof of corrugated iron on beams
  // and sandbags laid over it. `door` is the side the way in faces: "front" (-z) or "right" (+x).
  dugout(cx, cz, w, d, { h = 2.2, door = "front", doorAt = 0 } = {}) {
    const hw = w / 2;
    const hd = d / 2;
    // Timber inside, sandbags banked against the outside.
    const wall = (len, x, z, yaw, bank = true) => {
      this.put(plankWall(len, h), x, 0, z, yaw);
      if (!bank) return;
      this.bags(len + 0.5, 6, x - Math.sin(yaw) * 0.32, 0, z - Math.cos(yaw) * 0.32, yaw);
      this.bags(len + 0.9, 3, x - Math.sin(yaw) * 0.66, 0, z - Math.cos(yaw) * 0.66, yaw);
    };
    const withDoor = (len, x, z, yaw, at) => {
      const gap = 1.3;
      const a = len / 2 + at - gap / 2;
      const b = len / 2 - at - gap / 2;
      const ux = Math.cos(yaw);
      const uz = -Math.sin(yaw);
      if (a > 0.2) wall(a, x + ux * (-len / 2 + a / 2), z + uz * (-len / 2 + a / 2), yaw, false);
      if (b > 0.2) wall(b, x + ux * (len / 2 - b / 2), z + uz * (len / 2 - b / 2), yaw, false);
      this.put(doorway(1.1, 1.8), x + ux * at, 0, z + uz * at, yaw);
      this.put(tint(slab(gap + 0.4, 0.5, 0.35), T.post), x + ux * at, h - 0.05, z + uz * at, yaw);
    };
    if (door === "front") withDoor(w, cx, cz - hd, 0, doorAt);
    else wall(w, cx, cz - hd, 0);
    wall(w, cx, cz + hd, PI);
    // Each wall faces in (its local +z), so its bank of sandbags goes on its local -z side.
    wall(d, cx - hw, cz, PI / 2);
    if (door === "right") withDoor(d, cx + hw, cz, -PI / 2, doorAt);
    else wall(d, cx + hw, cz, -PI / 2);
    for (let i = 0; i <= 3; i++) this.put(tint(slab(w + 0.5, 0.14, 0.16), T.post), cx, h + 0.05, cz - hd + (d * i) / 3);
    const sheets = Math.ceil(w / 1.6);
    for (let i = 0; i < sheets; i++) {
      const sheet = ironSheet(1.7, d + 0.5, 0.5 + (i % 2) * 0.3);
      sheet.rotateX(-PI / 2).rotateY(0.03 * (i % 2 ? 1 : -1));
      this.put(sheet, cx - hw + 0.8 + i * 1.6, h + 0.14, cz);
    }
    this.bags(w * 0.8, 2, cx, h + 0.16, cz - hd + 0.3);
    this.bags(w * 0.6, 1, cx + 0.3, h + 0.16, cz + 0.4);
  }

  // The war room: a dugout at the end of the communication trench with the map table, the
  // dossier of orders, the stack of supply crates, the three supply tokens and a field clock.
  warRoom() {
    const { x, z } = PLACES.war;
    this.dugout(x, z, 4.6, 5, { door: "front", doorAt: -0.4 });
    this.put(duckboard(2.4, 0.9), x - 0.4, 0, z - 1.3, PI / 2);
    // The map table on trestles.
    const table = join([
      [box(2.2, 0.08, 1.2, 0.02), T.plankLight],
      ...[-0.85, 0.85].map((dx) => [box(0.08, 0.8, 1, 0.02).translate(dx, -0.42, 0), T.post]),
      [box(1.8, 0.07, 0.07, 0.02).translate(0, -0.6, 0), T.post],
    ]);
    this.put(table, x - 0.2, 0.84, z + 0.6);
    const map = paint(512, 288, (c, W, H) => {
      c.fillStyle = "#d8c9a4";
      c.fillRect(0, 0, W, H);
      c.strokeStyle = "rgba(60, 90, 140, 0.55)";
      c.lineWidth = 2;
      for (let i = 0; i < 9; i++) {
        c.beginPath();
        const y = 20 + i * 30;
        c.moveTo(0, y);
        for (let xx = 0; xx <= W; xx += 32) c.lineTo(xx, y + Math.sin(xx * 0.02 + i) * 9);
        c.stroke();
      }
      c.strokeStyle = "#8a2a1a";
      c.lineWidth = 5;
      c.beginPath();
      c.moveTo(40, 90);
      for (let xx = 40; xx < W - 40; xx += 26) c.lineTo(xx, 90 + ((xx / 26) % 2 ? 10 : -10));
      c.stroke();
      c.strokeStyle = "#2a3a5a";
      c.beginPath();
      c.moveTo(40, 200);
      for (let xx = 40; xx < W - 40; xx += 26) c.lineTo(xx, 200 + ((xx / 26) % 2 ? 10 : -10));
      c.stroke();
    });
    this.mapSheet = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.05).rotateX(-PI / 2), new THREE.MeshLambertMaterial({ map }));
    this.mapSheet.position.set(x - 0.2, 0.885, z + 0.6);
    this.group.add(this.mapSheet);
    // The dossier, closed on the table, ready to open.
    const dossier = new THREE.Group();
    dossier.add(new THREE.Mesh(tint(slab(0.5, 0.03, 0.36), 0xc9a869), this.mat));
    dossier.position.set(x + 0.35, 0.91, z + 0.45);
    dossier.rotation.y = -0.2;
    this.group.add(dossier);
    this.touch.dossier = dossier;
    this.anchors.dossier = dossier.position.clone();
    // Five toy supply crates on the map: the stack shows as many as the orders give.
    const stack = [];
    for (let i = 0; i < 5; i++) {
      const at = (g) => g.rotateY(i % 2 ? 0.08 : -0.06).translate((i % 3) * 0.52 + (i > 2 ? 0.26 : 0), 0.21 + Math.floor(i / 3) * 0.43, 0);
      stack.push([at(box(0.5, 0.42, 0.42, 0.03)), i % 2 ? 0x4f5733 : 0x5a6239]);
      stack.push([at(slab(0.52, 0.07, 0.44)), 0xb7ad8a]);
    }
    const crates = new THREE.Mesh(join(stack), this.mat);
    this.crateVerts = crates.geometry.attributes.position.count / 5;
    crates.scale.setScalar(0.34);
    crates.position.set(x + 0.36, 0.885, z + 0.98);
    this.group.add(crates);
    this.touch.crates = crates;
    // The three supply tokens, as painted toys on the map.
    const tokens = new THREE.Group();
    const plane = buildPlane(SIDES.me.clay, 0x2b2622);
    plane.scale.setScalar(0.09);
    plane.position.set(-0.55, 0.04, -0.1);
    plane.rotation.y = 0.6;
    const sc = new THREE.Mesh(scope(), this.mat);
    sc.scale.setScalar(0.28);
    sc.position.set(-0.1, 0.04, 0.25);
    sc.rotation.set(0, -0.8, PI / 2);
    const sm = new THREE.Mesh(smoke(), this.mat);
    sm.scale.setScalar(0.3);
    sm.position.set(0.3, 0.0, -0.25);
    tokens.add(plane, sc, sm);
    this.tokens = { recon: plane, sniper: sc, smoke: sm };
    tokens.position.set(x - 0.4, 0.9, z + 0.6);
    this.group.add(tokens);
    this.touch.tokens = tokens;
    // The field clock on the back wall.
    const clock = join([
      [cyl(0.2, 0.2, 0.06, 24).rotateX(PI / 2), K.brassDark],
      [cyl(0.17, 0.17, 0.02, 24).rotateX(PI / 2).translate(0, 0, 0.035), K.cream],
      [box(0.012, 0.13, 0.01, 0.004).translate(0, 0.05, 0.05), K.ink],
      [box(0.1, 0.012, 0.01, 0.004).translate(0.04, 0, 0.05), K.ink],
    ]);
    this.put(clock, x + 0.9, 1.6, z + 2.3, PI);
    this.lamp(x - 0.2, 1.75, z + 0.6);
  }

  // The signals dugout, off a branch to the left of the communication trench: the field
  // telephone on a shelf and the chalkboard where a room's code is written.
  signals() {
    const { x, z } = PLACES.signals;
    // The branch from the communication trench.
    this.bags(2.6, 6, -15.3, 0, 13.3);
    this.bags(2.6, 6, -15.3, 0, 14.9, PI);
    this.put(duckboard(2.4, 0.7), -15.4, 0, 14.1);
    this.dugout(x, z, 3.6, 4, { door: "right", doorAt: -1.5 });
    // The telephone on a shelf under the chalkboard, both on the back wall facing the door.
    this.put(tint(slab(1.5, 0.07, 0.46), T.plankLight), x - 0.1, 0.95, z + 1.6);
    for (const dx of [-0.65, 0.45]) this.put(tint(slab(0.06, 0.95, 0.06), T.post), x + dx, 0.47, z + 1.7);
    const phone = new THREE.Mesh(fieldPhone(), this.mat);
    phone.scale.setScalar(0.46);
    phone.position.set(x - 0.35, 0.99, z + 1.55);
    phone.rotation.y = PI + 0.25;
    this.group.add(phone);
    this.touch.phone = phone;
    this.anchors.phone = phone.position.clone().add(new THREE.Vector3(0, 0.25, 0));
    this.chalkboard = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.62), new THREE.MeshLambertMaterial({ color: 0x23291f }));
    this.chalkboard.position.set(x - 0.1, 1.84, z + 1.72);
    this.chalkboard.rotation.y = PI;
    this.group.add(this.chalkboard);
    this.put(tint(slab(1.3, 0.72, 0.04), T.post), x - 0.1, 1.84, z + 1.75);
    this.touch.chalkboard = this.chalkboard;
    this.anchors.chalkboard = this.chalkboard.position.clone().add(new THREE.Vector3(0.25, -0.05, 0));
    this.chalk("");
    this.lamp(x - 1.5, 1.7, z + 1.2);
  }

  // The radio post: a sandbag emplacement roofed with a sheet of iron, the radio set on a crate,
  // its aerial on a pole, and a clipboard of orders hung on a post.
  radioPost() {
    const { x, z } = PLACES.radio;
    // The trench from the war room's side to the post.
    this.bags(3.2, 6, -10.4, 0, 21.6, PI / 2);
    this.bags(3.2, 6, -8.8, 0, 21.2, PI / 2);
    this.put(duckboard(2.6, 0.7), -9.6, 0, 21.4, PI / 2);
    this.bags(3.4, 6, x - 1.6, 0, z + 0.2, PI / 2);
    this.bags(3.2, 6, x, 0, z + 1.8);
    this.bags(2.2, 6, x + 1.6, 0, z + 0.6, PI / 2);
    for (const [dx, dz] of [[-1.3, -1.1], [1.3, -1.1], [-1.3, 1.4], [1.3, 1.4]]) this.put(tint(slab(0.12, 2.3, 0.12), T.post), x + dx, 1.15, z + dz);
    const roof = ironSheet(3, 2.9, 0.7);
    roof.rotateX(-PI / 2 + 0.08);
    this.put(roof, x, 2.34, z + 0.15);
    this.put(tint(slab(0.8, 0.6, 0.6), 0x7a5431), x, 0.3, z + 0.9);
    const radio = new THREE.Group();
    radio.add(new THREE.Mesh(join([
      [box(0.7, 0.42, 0.34, 0.03), 0x4a3423],
      [box(0.62, 0.3, 0.02, 0.01).translate(0, 0.02, 0.17), 0x1d1c1f],
      [cyl(0.1, 0.1, 0.02, 20).rotateX(PI / 2).translate(-0.15, 0.03, 0.185), K.cream],
      [cyl(0.05, 0.05, 0.03, 12).rotateX(PI / 2).translate(0.12, 0.08, 0.19), K.brass],
      [cyl(0.05, 0.05, 0.03, 12).rotateX(PI / 2).translate(0.12, -0.07, 0.19), K.brass],
    ]), this.mat));
    const needle = new THREE.Mesh(tint(slab(0.008, 0.085, 0.006), 0x8a2a1a).translate(0, 0.036, 0), this.mat);
    this.needle = new THREE.Group();
    this.needle.position.set(-0.15, 0.03, 0.198);
    this.needle.rotation.z = 1.1;
    this.needle.add(needle);
    radio.add(this.needle);
    radio.position.set(x, 0.81, z + 0.9);
    radio.rotation.y = PI;
    this.group.add(radio);
    this.touch.radio = radio;
    this.anchors.radio = radio.position.clone().add(new THREE.Vector3(0, 0.05, 0));
    this.put(tint(slab(0.08, 4.2, 0.08), T.post), x + 1.9, 2.1, z + 2.3);
    this.put(tint(cyl(0.006, 0.006, 2.4, 4).rotateZ(1.2), K.metal), x + 0.95, 3.1, z + 1.6);
    const clip = new THREE.Group();
    clip.add(new THREE.Mesh(join([[box(0.32, 0.44, 0.02, 0.01), 0x6f4d2f], [box(0.28, 0.36, 0.01, 0.005).translate(0, -0.02, 0.012), K.paper], [box(0.12, 0.04, 0.03, 0.01).translate(0, 0.2, 0.02), K.metal]]), this.mat));
    clip.position.set(x + 1.3, 1.35, z - 1.02);
    this.group.add(clip);
    this.touch.clipboard = clip;
    this.anchors.clipboard = clip.position.clone();
    this.lamp(x + 1.2, 2.05, z - 1.0);
  }

  // Nameplates for the enemy commanders, leant against the front of their parapet while the
  // title shows them.
  plates() {
    const names = ["Recruit", "Sergeant", "General"];
    const tex = paint(512, 192, (c) => {
      const W = 1024;
      const H = 384;
      c.scale(0.5, 0.5);
      names.forEach((n, i) => {
        const y = (i * H) / 3;
        c.fillStyle = ["#8a6440", "#7a5431", "#946b43"][i];
        c.fillRect(0, y, W, H / 3);
        c.fillStyle = "rgba(0, 0, 0, 0.25)";
        c.fillRect(0, y + H / 3 - 6, W, 6);
        stencil(c, n.toUpperCase(), W / 2, y + H / 6 + 4, 78, "#efe6d0", { spray: 0.25 });
      });
    });
    this.plates = new THREE.Group();
    names.forEach((n, i) => {
      const geo = new THREE.PlaneGeometry(1.5, 0.4);
      const uv = geo.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setY(k, 1 - (i + 1) / 3 + uv.getY(k) / 3);
      const plate = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
      plate.position.set(-2.4 + i * 2.4, 0.4, -16.18);
      plate.rotation.x = -0.25;
      this.plates.add(plate);
      const key = ["recruit", "sergeant", "general"][i];
      this.anchors[key] = plate.position.clone();
      this.boxes[key] = { obj: plate, a: new THREE.Vector3(-0.75, 0, 0), b: new THREE.Vector3(0.75, 0, 0), h: 0.2 };
    });
    this.plates.visible = false;
    this.group.add(this.plates);
  }

  // The leaderboard pinned to the notice board: the first names, typed.
  roll(players) {
    const tex = this.rollTex || (this.rollTex = paint(512, 350, () => {}));
    const c = tex.image.getContext("2d");
    c.fillStyle = "#e6dcc2";
    c.fillRect(0, 0, 512, 350);
    c.fillStyle = "#2b241d";
    c.textAlign = "center";
    c.font = '700 34px "Stardos Stencil", sans-serif';
    c.fillText("LEADERBOARD", 256, 44);
    c.fillRect(60, 58, 392, 3);
    c.textAlign = "left";
    c.font = '700 22px "Courier Prime", monospace';
    (players || []).slice(0, 9).forEach((p, i) => {
      c.fillText(`${i + 1}. ${p.name}`, 64, 94 + i * 28);
      c.textAlign = "right";
      c.fillText(`${p.wins}`, 448, 94 + i * 28);
      c.textAlign = "left";
    });
    tex.needsUpdate = true;
    this.boardPaper.material.map = tex;
    this.boardPaper.material.color.set(0xd8cfba);
    this.boardPaper.material.needsUpdate = true;
  }

  // The title's own set dressing on the enemy side, shown with the commanders.
  parade(on) {
    this.plates.visible = on;
  }

  // Chalks a room's code (or nothing) on the signals dugout's board.
  chalk(code) {
    const tex = this.chalkTex || (this.chalkTex = paint(512, 320, () => {}));
    const c = tex.image.getContext("2d");
    const W = 512;
    const H = 320;
    c.fillStyle = "#23291f";
    c.fillRect(0, 0, W, H);
    const r = seeded(11);
    for (let i = 0; i < 40; i++) {
      c.fillStyle = `rgba(230, 230, 220, ${0.02 + r() * 0.04})`;
      c.beginPath();
      c.ellipse(r() * W, r() * H, 20 + r() * 60, 6 + r() * 14, r() * 3, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = "rgba(240, 238, 228, 0.9)";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = '700 44px "Caveat", cursive';
    c.fillText(code ? "Room code" : "Signals", W / 2, 64);
    if (code) {
      c.font = '700 132px "Caveat", cursive';
      c.fillText(code.split("").join(" "), W / 2, 188);
    } else {
      c.font = '700 38px "Caveat", cursive';
      c.fillText("Open a room, or dial a friend's code", W / 2, 180);
    }
    tex.needsUpdate = true;
    this.chalkboard.material.map = tex;
    this.chalkboard.material.color.set(0xffffff);
    this.chalkboard.material.needsUpdate = true;
  }

  // The war room shows the orders as they are set: a crate in the stack for each crate given,
  // and the tokens of the supplies that are on.
  orders(o) {
    if (!this.touch.crates) return;
    this.touch.crates.geometry.setDrawRange(0, this.crateVerts * o.crates);
    for (const k in this.tokens) this.tokens[k].visible = !!o[k];
  }

  // Your record, chalked as tallies on the parapet: won above, lost below.
  tally(p) {
    const m = this.tallyMesh;
    if (!m) return;
    const won = p ? (p.wins || 0) + (p.soloWins || 0) : 0;
    const lost = p ? (p.losses || 0) + (p.soloLosses || 0) : 0;
    m.visible = won + lost > 0;
    if (!m.visible) return;
    const tex = this.tallyTex || (this.tallyTex = paint(512, 204, () => {}));
    const c = tex.image.getContext("2d");
    c.clearRect(0, 0, 512, 204);
    c.strokeStyle = c.fillStyle = "rgba(236, 232, 220, 0.85)";
    c.lineCap = "round";
    c.font = '700 50px "Caveat", cursive';
    c.textBaseline = "middle";
    const r = seeded(won * 31 + lost);
    [[won, "won", 52], [lost, "lost", 150]].forEach(([n, word, y]) => {
      c.fillText(word, 10, y);
      let px = 116;
      for (let i = 0; i < Math.min(n, 15); i++) {
        c.lineWidth = 7;
        c.beginPath();
        if (i % 5 === 4) {
          c.moveTo(px - 4 * 21 - 12, y + 24 + r() * 5);
          c.lineTo(px - 8, y - 26 + r() * 5);
          px += 34;
        } else {
          c.moveTo(px + r() * 4, y - 34);
          c.lineTo(px + r() * 5 - 2, y + 34);
          px += 21;
        }
        c.stroke();
      }
      if (n > 15) c.fillText(`+${n - 15}`, px + 4, y);
    });
    tex.needsUpdate = true;
    m.material.map = tex;
    m.material.emissiveMap = tex;
    m.material.needsUpdate = true;
  }

  // The field manual's cover, lifted open or closed.
  book(open) {
    this.bookTo = open ? 1 : 0;
  }

  furl() {
    this.bannerK = 0;
    this.unfurlAt = Infinity;
  }

  unfurl(delay = 0) {
    this.unfurlAt = this.time + delay;
  }

  // A plank or a prop lifts or swings a little while it is pointed at.
  hover(key, on) {
    if (on && !this.swing[key]) this.swingAt = { ...this.swingAt, [key]: this.time };
    this.swing[key] = on ? 1 : 0;
  }

  update(dt) {
    this.time += dt;
    const ease = 1 - Math.exp(-dt * 6);
    if (this.cover) {
      this.bookK = (this.bookK || 0) + ((this.bookTo || 0) - (this.bookK || 0)) * ease;
      this.cover.rotation.z = this.bookK * 2.95;
    }
    if (this.needle) {
      const to = this.searching ? Math.sin(this.time * 0.8) * 0.9 + Math.sin(this.time * 2.9) * 0.18 : 1.1;
      this.needle.rotation.z += (to - this.needle.rotation.z) * ease;
    }
    if (this.bannerK < 1 && this.time >= this.unfurlAt) this.bannerK = Math.min(1, this.bannerK + dt / 1.2);
    if (this.bannerMesh) {
      const k = this.bannerK;
      const e = k * k * (3 - 2 * k);
      this.bannerMesh.scale.y = Math.max(0.02, e);
      this.bannerMesh.position.y = this.bannerTop - (this.bannerH / 2) * this.bannerMesh.scale.y;
      this.bannerRoll.visible = k < 1;
      this.bannerRoll.position.y = this.bannerTop - this.bannerH * e;
    }
    // A plank pointed at swings once and settles, lifted.
    for (const s of this.signs || []) {
      const to = this.swing[s.key] || 0;
      s.k = (s.k || 0) + (to - (s.k || 0)) * (1 - Math.exp(-dt * 10));
      const fade = calm.matches ? 0 : Math.exp(-(this.time - (this.swingAt?.[s.key] || 0)) * 2.5);
      s.plank.rotation.x = Math.sin(this.time * 7) * 0.05 * s.k * fade;
      s.plank.position.y = s.k * 0.03;
    }
    const b = this.bannerMesh;
    if (b && this.live && !(calm.matches && this.stillBanner)) {
      this.stillBanner = calm.matches;
      const p = b.geometry.attributes.position;
      const base = this.bannerBase;
      const t = this.time;
      for (let i = 0; i < p.count; i++) {
        const bx = base[i * 3];
        const by = base[i * 3 + 1];
        const hang = 1 - Math.pow(bx / 1.8, 2);
        p.setY(i, by - hang * 0.08);
        p.setZ(i, Math.sin(bx * 2.1 + t * 1.6) * 0.035 * hang + Math.sin(by * 3 + t * 2.3) * 0.015);
      }
      p.needsUpdate = true;
    }
  }
}
