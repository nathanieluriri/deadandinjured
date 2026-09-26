import * as THREE from "three";
import { groundHeight } from "./palette.js";

const vert = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iCol;
attribute vec2 iSize;
varying vec2 vUv;
varying vec4 vCol;
varying float vFog;
uniform float fogNear;
uniform float fogFar;
void main() {
  vUv = uv;
  vCol = iCol;
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  float c = cos(iSize.y);
  float s = sin(iSize.y);
  vec2 p = position.xy * iSize.x;
  mv.xy += vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  vFog = smoothstep(fogNear, fogFar, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const frag = /* glsl */ `
uniform sampler2D map;
uniform vec3 fogColor;
uniform float additive;
varying vec2 vUv;
varying vec4 vCol;
varying float vFog;
void main() {
  vec4 t = texture2D(map, vUv);
  vec3 col = vCol.rgb * t.rgb;
  float a = t.a * vCol.a;
  if (additive > 0.5) { col *= a * (1.0 - vFog); gl_FragColor = vec4(col, 1.0); }
  else { col = mix(col, fogColor, vFog); gl_FragColor = vec4(col, a); }
  if (gl_FragColor.a < 0.004) discard;
  #include <colorspace_fragment>
}`;

function texture(draw, size = 64) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const glowTex = () => texture((x, s) => {
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.75)");
  g.addColorStop(0.6, "rgba(255,255,255,0.18)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, s, s);
});

const puffTex = () => texture((x, s) => {
  for (let i = 0; i < 14; i++) {
    const r = s * (0.14 + Math.random() * 0.2);
    const cx = s / 2 + (Math.random() - 0.5) * s * 0.4;
    const cy = s / 2 + (Math.random() - 0.5) * s * 0.4;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    const v = 200 + Math.floor(Math.random() * 55);
    g.addColorStop(0, `rgba(${v},${v},${v},0.5)`);
    g.addColorStop(1, `rgba(${v},${v},${v},0)`);
    x.fillStyle = g;
    x.fillRect(0, 0, s, s);
  }
}, 128);

const craterTex = () => texture((x, s) => {
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(14,10,8,0.95)");
  g.addColorStop(0.45, "rgba(26,19,14,0.85)");
  g.addColorStop(0.62, "rgba(70,56,40,0.55)");
  g.addColorStop(0.75, "rgba(40,30,22,0.35)");
  g.addColorStop(1, "rgba(40,30,22,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, s, s);
}, 128);

class Sprites {
  constructor(scene, map, additive, max = 420) {
    this.max = max;
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute("position", base.attributes.position);
    g.setAttribute("uv", base.attributes.uv);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("iPos", this.aPos);
    g.setAttribute("iCol", this.aCol);
    g.setAttribute("iSize", this.aSize);
    g.instanceCount = 0;
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: {
        map: { value: map }, fogColor: { value: scene.fog.color }, fogNear: { value: scene.fog.near }, fogFar: { value: scene.fog.far },
        additive: { value: additive ? 1 : 0 },
      },
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 3 : 2;
    scene.add(this.mesh);
    this.list = [];
  }

  spawn(o) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({
      pos: o.pos.clone(), vel: o.vel ? o.vel.clone() : new THREE.Vector3(), age: 0, life: o.life || 1,
      s0: o.s0 ?? 1, s1: o.s1 ?? o.s0 ?? 1, c0: o.c0, c1: o.c1 || o.c0, a0: o.a0 ?? 1, a1: o.a1 ?? 0,
      rot: o.rot ?? Math.random() * 6.28, spin: o.spin ?? 0, drag: o.drag ?? 0, grav: o.grav ?? 0, delay: o.delay || 0,
    });
  }

  update(dt) {
    let n = 0;
    const out = [];
    for (const p of this.list) {
      if (p.delay > 0) {
        p.delay -= dt;
        out.push(p);
        continue;
      }
      p.age += dt;
      if (p.age >= p.life) continue;
      out.push(p);
      p.vel.y -= p.grav * dt;
      p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      p.rot += p.spin * dt;
      const t = p.age / p.life;
      const e = 1 - (1 - t) * (1 - t);
      this.aPos.array[n * 3] = p.pos.x;
      this.aPos.array[n * 3 + 1] = p.pos.y;
      this.aPos.array[n * 3 + 2] = p.pos.z;
      this.aCol.array[n * 4] = p.c0.r + (p.c1.r - p.c0.r) * t;
      this.aCol.array[n * 4 + 1] = p.c0.g + (p.c1.g - p.c0.g) * t;
      this.aCol.array[n * 4 + 2] = p.c0.b + (p.c1.b - p.c0.b) * t;
      this.aCol.array[n * 4 + 3] = (p.a0 + (p.a1 - p.a0) * t) * Math.min(1, p.age * 30);
      this.aSize.array[n * 2] = p.s0 + (p.s1 - p.s0) * e;
      this.aSize.array[n * 2 + 1] = p.rot;
      n++;
    }
    this.list = out;
    this.geo.instanceCount = n;
    if (n) {
      this.aPos.needsUpdate = true;
      this.aCol.needsUpdate = true;
      this.aSize.needsUpdate = true;
    }
  }
}

const C = (hex) => new THREE.Color(hex);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = (a, b) => a + Math.random() * (b - a);
const sphere = (r) => {
  const v = V(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1));
  return v.normalize().multiplyScalar(r * Math.cbrt(Math.random()));
};

export class Fx {
  constructor(stage, world) {
    this.stage = stage;
    this.world = world;
    const scene = stage.scene;
    this.fire = new Sprites(scene, glowTex(), true, 480);
    this.smoke = new Sprites(scene, puffTex(), false, 420);

    this.debrisMax = 180;
    this.debris = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.1, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), this.debrisMax);
    this.debris.frustumCulled = false;
    this.debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.debris.count = 0;
    this.debris.setColorAt(0, C(0xffffff));
    scene.add(this.debris);
    this.chunks = [];

    this.craterMax = 44;
    this.craters = new THREE.InstancedMesh(
      new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: craterTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
      this.craterMax,
    );
    this.craters.frustumCulled = false;
    this.craters.count = 0;
    this.craterNext = 0;
    scene.add(this.craters);

    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffb070, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.visible = false;
      scene.add(m);
      this.rings.push({ mesh: m, age: 1, life: 1, size: 1 });
    }
    this.screens = [];
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.v = V();
    this.s = V();
    stage.hooks.push((dt) => this.update(dt));
  }

  // Pushes one of each effect through the renderer so every shader is compiled before play.
  warm() {
    this.explode(V(0, -30, -60), { size: 0.3, crater: false });
    this.smoke.spawn({ pos: V(0, -30, -60), c0: C(0x555555), life: 0.2 });
  }

  flashLight(pos, power = 1) {
    const f = this.world.flash;
    f.position.copy(pos).y += 1.5;
    f.intensity = Math.max(f.intensity, 38 * power);
  }

  explode(pos, { size = 1, air = false, crater = !air, dirt = !air, chips = null } = {}) {
    this.flashLight(pos, size);
    this.fire.spawn({ pos, s0: 1.6 * size, s1: 3 * size, c0: C(0xffe9c4), c1: C(0xff8a30), a0: 0.85, a1: 0, life: 0.14 });
    for (let i = 0; i < 10 * size + 4; i++) {
      this.fire.spawn({
        pos: pos.clone().add(sphere(0.45 * size)), vel: sphere(3.8 * size).add(V(0, air ? 0 : 2, 0)), drag: 3.4,
        s0: rnd(0.6, 1.1) * size, s1: rnd(1.4, 2.3) * size, c0: C(0xffc98a), c1: C(0xc03a14), a0: 0.75, a1: 0, life: rnd(0.3, 0.55), spin: rnd(-2, 2),
      });
    }
    for (let i = 0; i < 18; i++) {
      this.fire.spawn({
        pos: pos.clone(), vel: sphere(1).normalize().multiplyScalar(rnd(6, 13) * Math.sqrt(size)), grav: 9, drag: 0.8,
        s0: rnd(0.12, 0.2), s1: 0.05, c0: C(0xfff0c0), c1: C(0xff7a20), a0: 1, a1: 0.4, life: rnd(0.4, 0.95),
      });
    }
    for (let i = 0; i < 7 * size + 3; i++) {
      this.smoke.spawn({
        pos: pos.clone().add(sphere(0.7 * size)), vel: V(rnd(-1, 1), rnd(1, 2.4), rnd(-1, 1)).multiplyScalar(size), drag: 1.2,
        s0: rnd(0.9, 1.4) * size, s1: rnd(2.6, 3.8) * size, c0: C(0x2e2723), c1: C(0x5a504a), a0: 0.62, a1: 0, life: rnd(1.4, 2.4), spin: rnd(-0.4, 0.4), delay: rnd(0.02, 0.12),
      });
    }
    if (dirt) {
      this.spray(pos, 14 * size, 0x3a2e22, 6 * Math.sqrt(size));
      this.ring(pos, 5.5 * size);
    }
    if (chips) this.spray(pos.clone().setY(pos.y + 0.8), 10, chips, 5, 0.7);
    if (crater) this.crater(pos, rnd(1, 1.35) * size);
  }

  spray(pos, n, color, speed = 6, scale = 1) {
    const c = C(color);
    for (let i = 0; i < n; i++) {
      const v = V(rnd(-1, 1), rnd(0.6, 1.4), rnd(-1, 1)).normalize().multiplyScalar(rnd(0.5, 1) * speed);
      const tint = c.clone().multiplyScalar(rnd(0.7, 1.2));
      if (this.chunks.length >= this.debrisMax) this.chunks.shift();
      this.chunks.push({ pos: pos.clone().add(V(rnd(-0.3, 0.3), 0.1, rnd(-0.3, 0.3))), vel: v, rot: V(rnd(0, 6), rnd(0, 6), rnd(0, 6)), spin: V(rnd(-12, 12), rnd(-12, 12), rnd(-12, 12)), age: 0, size: rnd(0.5, 1.5) * scale, color: tint, rest: false });
    }
  }

  ring(pos, size) {
    const r = this.rings.find((x) => x.age >= x.life) || this.rings[0];
    r.age = 0;
    r.life = 0.55;
    r.size = size;
    r.mesh.position.set(pos.x, groundHeight(pos.x, pos.z) + 0.08, pos.z);
    r.mesh.visible = true;
  }

  crater(pos, size) {
    const i = this.craterNext++ % this.craterMax;
    this.craters.count = Math.min(this.craterMax, this.craters.count + 1);
    this.q.setFromAxisAngle(V(0, 1, 0), Math.random() * 6.28);
    this.m.compose(V(pos.x, groundHeight(pos.x, pos.z) + 0.03, pos.z), this.q, V(size, 1, size * rnd(0.8, 1.1)));
    this.craters.setMatrixAt(i, this.m);
    this.craters.instanceMatrix.needsUpdate = true;
  }

  dust(pos, n = 6, size = 1) {
    for (let i = 0; i < n; i++) {
      this.smoke.spawn({
        pos: pos.clone().add(V(rnd(-0.5, 0.5), 0.1, rnd(-0.5, 0.5))), vel: V(rnd(-1.2, 1.2), rnd(0.2, 0.8), rnd(-1.2, 1.2)), drag: 2,
        s0: 0.6 * size, s1: rnd(1.6, 2.4) * size, c0: C(0x6b5a45), c1: C(0x8a7a66), a0: 0.55, a1: 0, life: rnd(0.9, 1.6),
      });
    }
  }

  muzzle(pos, dir) {
    this.fire.spawn({ pos: pos.clone().addScaledVector(dir, 0.3), s0: 1.5, s1: 2.4, c0: C(0xfff4d0), c1: C(0xff8a2a), a0: 1, a1: 0, life: 0.12 });
    for (let i = 0; i < 6; i++) {
      this.smoke.spawn({
        pos: pos.clone().addScaledVector(dir, 0.4 + i * 0.15), vel: dir.clone().multiplyScalar(rnd(2, 5)).add(V(rnd(-0.5, 0.5), rnd(0.3, 1), rnd(-0.5, 0.5))), drag: 2.4,
        s0: 0.5, s1: rnd(1.6, 2.6), c0: C(0x8f8479), c1: C(0xb5aca2), a0: 0.6, a1: 0, life: rnd(1.2, 2),
      });
    }
    this.flashLight(pos, 0.5);
  }

  trail(pos, hot = 1) {
    this.fire.spawn({ pos, s0: 0.5 * hot, s1: 0.15, c0: C(0xffc070), c1: C(0xff5a10), a0: 0.9, a1: 0, life: 0.25 });
    this.smoke.spawn({ pos: pos.clone().add(sphere(0.1)), vel: V(0, 0.3, 0), s0: 0.35, s1: rnd(1, 1.5), c0: C(0x7a6e64), c1: C(0xa39a90), a0: 0.45, a1: 0, life: rnd(0.9, 1.4), drag: 1 });
  }

  // A smoke screen that keeps billowing around a squad until it is lifted.
  screen(center, on) {
    if (!on) {
      this.screens = this.screens.filter((s) => s.center.distanceTo(center) > 1);
      return;
    }
    if (this.screens.some((s) => s.center.distanceTo(center) < 1)) return;
    this.screens.push({ center: center.clone(), acc: 0 });
    for (let i = 0; i < 26; i++) this.screenPuff(center, true);
  }

  screenPuff(center, burst) {
    this.smoke.spawn({
      pos: center.clone().add(V(rnd(-5.5, 5.5), rnd(0.2, 1.6), rnd(-1.8, 1.8))), vel: V(rnd(-0.4, 0.4), rnd(0.05, 0.3), rnd(-0.3, 0.3)).multiplyScalar(burst ? 3 : 1), drag: 0.9,
      s0: rnd(1.6, 2.4), s1: rnd(4.5, 6.5), c0: C(0x9b958e), c1: C(0xc2bcb4), a0: 0.85, a1: 0, life: rnd(3.4, 5), spin: rnd(-0.2, 0.2),
    });
  }

  update(dt) {
    this.fire.update(dt);
    this.smoke.update(dt);
    for (const s of this.screens) {
      s.acc += dt;
      while (s.acc > 0.09) {
        s.acc -= 0.09;
        this.screenPuff(s.center, false);
      }
    }
    let n = 0;
    for (const c of this.chunks) {
      c.age += dt;
      if (!c.rest) {
        c.vel.y -= 16 * dt;
        c.pos.addScaledVector(c.vel, dt);
        c.rot.addScaledVector(c.spin, dt);
        const g = groundHeight(c.pos.x, c.pos.z) + 0.05;
        if (c.pos.y < g) {
          c.pos.y = g;
          if (c.vel.y < -2.5) {
            c.vel.y *= -0.3;
            c.vel.x *= 0.5;
            c.vel.z *= 0.5;
          } else c.rest = true;
        }
      }
      const fade = c.age > 4 ? Math.max(0, 1 - (c.age - 4) / 1.5) : 1;
      if (fade <= 0) continue;
      this.e.set(c.rot.x, c.rot.y, c.rot.z);
      this.q.setFromEuler(this.e);
      const sc = c.size * fade;
      this.m.compose(c.pos, this.q, this.s.set(sc, sc, sc));
      this.debris.setMatrixAt(n, this.m);
      this.debris.setColorAt(n, c.color);
      n++;
    }
    this.chunks = this.chunks.filter((c) => c.age < 5.5);
    this.debris.count = n;
    if (n) {
      this.debris.instanceMatrix.needsUpdate = true;
      this.debris.instanceColor.needsUpdate = true;
    }
    for (const r of this.rings) {
      if (r.age >= r.life) continue;
      r.age += dt;
      const t = Math.min(1, r.age / r.life);
      const s = 0.3 + r.size * (1 - Math.pow(1 - t, 3));
      r.mesh.scale.set(s, 1, s);
      r.mesh.material.opacity = (1 - t) * (1 - t) * 0.22;
      if (t >= 1) r.mesh.visible = false;
    }
  }
}
