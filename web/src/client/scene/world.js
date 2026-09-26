import * as THREE from "three";
import { merge as mergeGeometries } from "./merge.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { SIDES, COLORS, groundHeight, fbm } from "./palette.js";

const SUN = new THREE.Vector3(-0.52, 0.1, -1).normalize();

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const skyFrag = /* glsl */ `
uniform vec3 top; uniform vec3 mid; uniform vec3 hor; uniform vec3 sunCol; uniform vec3 sunDir; uniform float time; uniform float dim;
varying vec3 vDir;
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 c = mix(hor, mid, smoothstep(0.0, 0.22, y));
  c = mix(c, top, smoothstep(0.18, 0.8, y));
  c = mix(c, hor * 0.45, smoothstep(0.0, -0.12, y));
  float s = max(dot(d, sunDir), 0.0);
  c += sunCol * (pow(s, 1400.0) * 9.0 + pow(s, 30.0) * 0.5 + pow(s, 5.0) * 0.16);
  vec2 uv = d.xz / (y + 0.22) * 1.3 + vec2(time * 0.006, 0.0);
  float cl = n2(uv) * 0.6 + n2(uv * 2.3 + 4.0) * 0.3 + n2(uv * 5.1) * 0.1;
  float band = smoothstep(0.015, 0.12, y) * (1.0 - smoothstep(0.3, 0.62, y));
  float k = smoothstep(0.5, 0.78, cl) * band;
  vec3 cloud = mix(mid * 0.6, hor * 0.9 + sunCol * 0.25 * pow(s, 3.0), smoothstep(0.02, 0.2, y) * 0.5 + 0.25);
  c = mix(c, cloud, k * 0.75);
  gl_FragColor = vec4(c * dim, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function lin(hex) {
  return new THREE.Color(hex);
}

export class World {
  constructor(stage) {
    this.stage = stage;
    const scene = stage.scene;
    this.scene = scene;
    this.time = 0;
    scene.fog = new THREE.Fog(COLORS.fog, 34, 235);
    scene.background = lin(COLORS.fog);

    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: lin(COLORS.sky.top) }, mid: { value: lin(COLORS.sky.mid) }, hor: { value: lin(COLORS.sky.horizon) },
        sunCol: { value: lin(COLORS.sky.sun) }, sunDir: { value: SUN.clone() }, time: { value: 0 }, dim: { value: 1 },
      },
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), this.skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    this.hemi = new THREE.HemisphereLight(0xffc6a0, 0x2c2636, 1.05);
    this.sun = new THREE.DirectionalLight(0xffa35f, 3.4);
    this.sun.position.copy(SUN).multiplyScalar(100).setY(26);
    this.fill = new THREE.DirectionalLight(0x9fb0ff, 0.5);
    this.fill.position.set(18, 30, 60);
    this.flash = new THREE.PointLight(0xffb070, 0, 28, 1.5);
    this.flash.position.set(0, 3, 0);
    scene.add(this.hemi, this.sun, this.fill, this.flash);

    this.environment();
    this.terrain();
    this.mountains();
    this.sandbags();
    this.wire();
    this.trees();
    this.flags = { me: this.flag(SIDES.me), opp: this.flag(SIDES.opp) };
    this.cannons = { me: this.cannon(SIDES.me), opp: this.cannon(SIDES.opp) };
    this.embers();
    stage.hooks.push((dt) => this.update(dt));
  }

  environment() {
    const r = this.stage.renderer;
    const pm = new THREE.PMREMGenerator(r);
    const envScene = new THREE.Scene();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), this.skyMat);
    envScene.add(sky);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(9, 24).rotateX(-Math.PI / 2).translate(0, -1.2, 0), new THREE.MeshBasicMaterial({ color: 0x2b2519 }));
    envScene.add(ground);
    this.scene.environment = pm.fromScene(envScene, 0.035).texture;
    this.scene.environmentIntensity = 0.55;
    pm.dispose();
  }

  terrain() {
    const W = 280;
    const D = 240;
    const geo = new THREE.PlaneGeometry(W, D, 140, 120);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, -20);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, groundHeight(pos.getX(i), pos.getZ(i)));
    const flat = geo.toNonIndexed();
    flat.computeVertexNormals();
    const p = flat.attributes.position;
    const n = flat.attributes.normal;
    const col = new Float32Array(p.count * 3);
    const olive = lin(0x434326);
    const khaki = lin(0x77703f);
    const mud = lin(0x3f2d1f);
    const rock = lin(0x4c4239);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i += 3) {
      const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
      const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
      const z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
      const slope = 1 - n.getY(i);
      c.copy(olive).lerp(khaki, fbm(x * 0.18, z * 0.18, 2) * 0.9);
      const nearLine = Math.max(0, 1 - Math.min(Math.abs(z - SIDES.me.z), Math.abs(z - SIDES.opp.z)) / 5) * (Math.abs(x) < 10 ? 1 : 0);
      if (y < -0.3) c.lerp(mud, 0.85);
      else c.lerp(mud, nearLine * 0.55 + (Math.abs(x) < 9 && z < 2 && z > -14 ? 0.3 : 0));
      c.lerp(rock, Math.min(1, slope * 2.2));
      c.multiplyScalar(0.92 + fbm(x * 1.7, z * 1.7, 1) * 0.16);
      for (let k = 0; k < 3; k++) c.toArray(col, (i + k) * 3);
    }
    flat.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.ground = new THREE.Mesh(flat, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.scene.add(this.ground);
  }

  mountains() {
    const layers = [
      { z: -130, h: 34, color: 0x2d1d26, seed: 1 },
      { z: -175, h: 52, color: 0x3a2229, seed: 7 },
      { z: -230, h: 70, color: 0x4d2a2c, seed: 13 },
    ];
    for (const L of layers) {
      const seg = 90;
      const w = 900;
      const pts = [];
      const idx = [];
      for (let i = 0; i <= seg; i++) {
        const x = -w / 2 + (w * i) / seg;
        const peak = Math.pow(fbm(i * 0.11 + L.seed, L.seed, 4), 1.6) * L.h * 1.6 + 4;
        pts.push(x, peak, L.z + Math.sin(i * 0.7 + L.seed) * 6, x, -10, L.z);
        if (i < seg) {
          const a = i * 2;
          idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      g.setIndex(idx);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: L.color, fog: true }));
      m.renderOrder = -5;
      this.scene.add(m);
    }
  }

  sandbags() {
    const bag = new RoundedBoxGeometry(0.92, 0.3, 0.5, 2, 0.12);
    const list = [];
    for (const s of [SIDES.me, SIDES.opp]) {
      const z = s.z - s.dir * 1.15;
      for (let row = 0; row < 2; row++) {
        const n = row === 0 ? 12 : 11;
        for (let i = 0; i < n; i++) {
          const x = -5.9 + i * 1.0 + (row ? 0.5 : 0) + (Math.random() - 0.5) * 0.08;
          list.push([x, 0.15 + row * 0.28, z + (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.2]);
        }
      }
    }
    const mesh = new THREE.InstancedMesh(bag, new THREE.MeshLambertMaterial({ color: COLORS.sandbag }), list.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    list.forEach(([x, y, z, r], i) => {
      q.setFromEuler(new THREE.Euler(0, r, (Math.random() - 0.5) * 0.12));
      m.compose(new THREE.Vector3(x, y + groundHeight(x, z) * 0, z), q, new THREE.Vector3(1, 1 + Math.random() * 0.15, 1));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.setHex(COLORS.sandbag).multiplyScalar(0.85 + Math.random() * 0.3));
    });
    this.scene.add(mesh);
  }

  wire() {
    const posts = [];
    const pts = [];
    const z0 = -6;
    for (let x = -10.5; x <= 10.6; x += 3) {
      const z = z0 + Math.sin(x * 1.3) * 0.6;
      const y = groundHeight(x, z);
      const tilt = Math.sin(x * 2.1) * 0.15;
      posts.push([x, y, z, tilt]);
    }
    for (let i = 0; i < posts.length - 1; i++) {
      const [x1, y1, z1] = posts[i];
      const [x2, y2, z2] = posts[i + 1];
      for (const hgt of [0.45, 0.95]) {
        for (let k = 0; k < 8; k++) {
          const t0 = k / 8;
          const t1 = (k + 1) / 8;
          const sag = (t) => Math.sin(Math.PI * t) * 0.18;
          pts.push(x1 + (x2 - x1) * t0, y1 + (y2 - y1) * t0 + hgt - sag(t0), z1 + (z2 - z1) * t0);
          pts.push(x1 + (x2 - x1) * t1, y1 + (y2 - y1) * t1 + hgt - sag(t1), z1 + (z2 - z1) * t1);
        }
      }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    this.scene.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x241f1b })));
    const pg = new THREE.BoxGeometry(0.09, 1.25, 0.09).translate(0, 0.6, 0);
    const mesh = new THREE.InstancedMesh(pg, new THREE.MeshLambertMaterial({ color: COLORS.wood }), posts.length);
    const m = new THREE.Matrix4();
    posts.forEach(([x, y, z, t], i) => {
      m.makeRotationZ(t).setPosition(x, y, z);
      mesh.setMatrixAt(i, m);
    });
    this.scene.add(mesh);
  }

  trees() {
    const parts = [];
    const trunk = new THREE.CylinderGeometry(0.1, 0.22, 4.2, 5).translate(0, 2.1, 0);
    parts.push(trunk);
    const b1 = new THREE.CylinderGeometry(0.04, 0.09, 1.8, 4).translate(0, 0.9, 0).rotateZ(0.9).translate(0.2, 2.6, 0);
    const b2 = new THREE.CylinderGeometry(0.03, 0.08, 1.4, 4).translate(0, 0.7, 0).rotateZ(-0.8).translate(-0.1, 3.1, 0);
    const b3 = new THREE.CylinderGeometry(0.03, 0.06, 1.1, 4).translate(0, 0.55, 0).rotateX(0.7).translate(0, 3.4, 0.05);
    const tree = mergeGeometries([trunk, b1, b2, b3]);
    const spots = [[-14, -2], [-17.5, -11], [15.5, -4], [19, -14], [-12.5, 13], [13.2, 12], [-22, -24], [24, -26]];
    const mesh = new THREE.InstancedMesh(tree, new THREE.MeshLambertMaterial({ color: 0x241b16, flatShading: true }), spots.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    spots.forEach(([x, z], i) => {
      q.setFromEuler(new THREE.Euler((Math.random() - 0.5) * 0.2, Math.random() * 6, (Math.random() - 0.5) * 0.2));
      const s = 0.8 + Math.random() * 0.6;
      m.compose(new THREE.Vector3(x, groundHeight(x, z) - 0.2, z), q, new THREE.Vector3(s, s, s));
      mesh.setMatrixAt(i, m);
    });
    this.scene.add(mesh);
  }

  flag(side) {
    const g = new THREE.Group();
    const x = -5.6;
    const z = side.z + side.dir * 0.5;
    g.position.set(x, 0, z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 3.6, 6).translate(0, 1.8, 0), new THREE.MeshStandardMaterial({ color: COLORS.wood, roughness: 0.8 }));
    const cloth = new THREE.PlaneGeometry(1.3, 0.82, 12, 6).translate(0.65, 0, 0);
    const mat = new THREE.MeshStandardMaterial({ color: side.flag, roughness: 0.85, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(cloth, mat);
    mesh.position.y = 3.15;
    mesh.rotation.y = side.dir > 0 ? 0 : Math.PI;
    g.add(pole, mesh);
    this.scene.add(g);
    return { group: g, cloth: mesh, base: Float32Array.from(cloth.attributes.position.array), phase: Math.random() * 6, lower: 0 };
  }

  cannon(side) {
    const clay = new THREE.MeshStandardMaterial({ color: side.clay, roughness: 0.6 });
    const dark = new THREE.MeshStandardMaterial({ color: COLORS.metal, roughness: 0.45, metalness: 0.35 });
    const g = new THREE.Group();
    const x = 5.5;
    const z = side.z + side.dir * 0.35;
    g.position.set(x, 0, z);
    g.rotation.y = side.face;
    const wheel = new THREE.TorusGeometry(0.4, 0.07, 6, 18).rotateY(Math.PI / 2);
    const hub = new THREE.CylinderGeometry(0.08, 0.08, 0.95, 8).rotateZ(Math.PI / 2);
    const spokes = [];
    for (let i = 0; i < 6; i++) spokes.push(new THREE.BoxGeometry(0.03, 0.78, 0.035).rotateX((i * Math.PI) / 6));
    const w1 = mergeGeometries([wheel, ...spokes.map((s) => s.clone())]).translate(0.46, 0.42, 0);
    const w2 = mergeGeometries([wheel, ...spokes]).translate(-0.46, 0.42, 0);
    const trail = new THREE.BoxGeometry(0.2, 0.14, 1.5).rotateX(-0.28).translate(0, 0.32, -0.75);
    const shield = new THREE.BoxGeometry(1.05, 0.62, 0.05).rotateX(-0.12).translate(0, 0.78, 0.18);
    g.add(new THREE.Mesh(mergeGeometries([w1, w2, hub.translate(0, 0.42, 0)]), dark));
    g.add(new THREE.Mesh(mergeGeometries([trail, shield]), clay));
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.62, 0);
    const barrel = new THREE.Mesh(
      mergeGeometries([
        new THREE.CylinderGeometry(0.075, 0.11, 1.55, 12).rotateX(Math.PI / 2).translate(0, 0, 0.55),
        new THREE.TorusGeometry(0.085, 0.025, 6, 12).translate(0, 0, 1.32),
        new THREE.SphereGeometry(0.14, 10, 8).translate(0, 0, -0.25),
      ]),
      dark,
    );
    pivot.add(barrel);
    pivot.rotation.x = -0.35;
    g.add(pivot);
    this.scene.add(g);
    return { group: g, pivot, barrel, aim: 0.35, target: 0.35, recoil: 0 };
  }

  muzzle(side) {
    const c = this.cannons[side];
    c.group.updateMatrixWorld(true);
    return {
      pos: new THREE.Vector3(0, 0, 1.4).applyMatrix4(c.barrel.matrixWorld),
      dir: new THREE.Vector3(0, 0, 1).transformDirection(c.barrel.matrixWorld),
    };
  }

  embers() {
    const n = 220;
    const pos = new Float32Array(n * 3);
    this.emberSeed = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 60;
      pos[i * 3 + 1] = Math.random() * 12;
      pos[i * 3 + 2] = -32 + Math.random() * 50;
      this.emberSeed[i * 2] = Math.random() * 6.28;
      this.emberSeed[i * 2 + 1] = 0.25 + Math.random() * 0.6;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const cv = document.createElement("canvas");
    cv.width = cv.height = 32;
    const x = cv.getContext("2d");
    const grd = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.35, "rgba(255,200,140,0.6)");
    grd.addColorStop(1, "rgba(255,160,90,0)");
    x.fillStyle = grd;
    x.fillRect(0, 0, 32, 32);
    this.emberMat = new THREE.PointsMaterial({ size: 0.16, map: new THREE.CanvasTexture(cv), color: 0xffb37a, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending });
    this.ember = new THREE.Points(g, this.emberMat);
    this.ember.frustumCulled = false;
    this.scene.add(this.ember);
  }

  update(dt) {
    this.time += dt;
    this.skyMat.uniforms.time.value = this.time;
    for (const f of Object.values(this.flags)) {
      const a = f.cloth.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) {
        const bx = f.base[i * 3];
        const by = f.base[i * 3 + 1];
        const k = bx / 1.3;
        a.setZ(i, Math.sin(bx * 3.4 - this.time * 5.6 + f.phase) * 0.2 * k + Math.sin(by * 4 + bx * 2 + this.time * 3.3) * 0.06 * k);
        a.setY(i, by - k * k * 0.08 * (1 + f.lower));
      }
      a.needsUpdate = true;
      f.cloth.geometry.computeVertexNormals();
      f.cloth.position.y = 3.15 - f.lower * 2.6;
    }
    for (const c of Object.values(this.cannons)) {
      c.aim += (c.target - c.aim) * Math.min(1, dt * 6);
      c.recoil *= Math.exp(-dt * 7);
      c.pivot.rotation.x = -c.aim;
      c.barrel.position.z = -c.recoil * 0.35;
    }
    const p = this.ember.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const s = this.emberSeed[i * 2];
      const v = this.emberSeed[i * 2 + 1];
      let y = p.getY(i) + dt * v;
      if (y > 13) y = 0;
      p.setY(i, y);
      p.setX(i, p.getX(i) + Math.sin(this.time * 0.7 + s) * dt * 0.35 + dt * 0.25);
      if (p.getX(i) > 30) p.setX(i, -30);
    }
    p.needsUpdate = true;
    this.flash.intensity *= Math.exp(-dt * 11);
  }
}
