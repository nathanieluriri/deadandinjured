import * as THREE from "three";
import { gsap } from "gsap/gsap-core";

const coarse = matchMedia("(pointer: coarse)").matches;

export class Stage {
  constructor(canvas, { alpha = false } = {}) {
    const film = /[?&]film\b/.test(location.search);
    const dpr = window.devicePixelRatio || 1;
    // Phones start a step lower and stop at 2: the icons on the bar draw at full sharpness on a
    // canvas of their own (icons.js), so the field alone trades resolution for frame rate.
    this.cap = film ? dpr : Math.min(dpr, 2);
    this.floor = Math.min(this.cap, coarse ? 1.25 : 1);
    this.dpr = Math.min(this.cap, coarse ? 1.75 : 2);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha, powerPreference: "high-performance", stencil: false });
    if (coarse) this.renderer.debug.checkShaderErrors = false;
    this.alpha = alpha;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1200);
    this.hooks = [];
    this.restores = [];
    this.timeScale = 1;
    this.inset = { top: 0, bottom: 0, side: 0 };
    this.view = 0;
    this.viewX = 0;
    this.time = 0;
    this.frames = [];
    this.good = 0;
    this.patience = 8;
    this.sinceUp = 99;
    this.buffer = { w: 0, h: 0, dpr: 0 };
    this.worldOn = true;
    this.overlays = [];
    this.back = new THREE.Color(0x0c0d12);
    this.adaptive = !window.__vclock && !/[?&]hq\b/.test(location.search);
    this.resize();
    addEventListener("resize", () => this.resize());
    canvas.addEventListener("webglcontextrestored", () => {
      this.buffer.dpr = 0;
      for (const f of this.restores) f();
    });
    gsap.ticker.add((time, deltaMs) => this.frame(deltaMs));
  }

  get aspect() {
    return Math.max(1, innerWidth - this.inset.side * 0.6) / Math.max(1, innerHeight - this.inset.bottom * 0.6);
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.offset();
    this.onResize?.();
  }

  // `side` is taken from the right, for a sheet standing beside the scene.
  setInset(top, bottom, glide = false, side = 0) {
    if (top === this.inset.top && bottom === this.inset.bottom && side === this.inset.side) return;
    this.inset = { top, bottom, side };
    this.glide = glide && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.offset();
    this.onResize?.();
  }

  // Keeps the focal point centred in the part of the screen the panels leave open. A glide
  // eases there over half a second instead of jumping, for panels that arrive during a shot.
  offset(real = 0) {
    const to = (this.inset.bottom - this.inset.top) / 2;
    const toX = this.inset.side / 2;
    const k = this.glide && real ? 1 - Math.exp(-real * 5) : this.glide ? 0 : 1;
    this.view += (to - this.view) * k;
    this.viewX += (toX - this.viewX) * k;
    if (Math.abs(to - this.view) < 0.5 && Math.abs(toX - this.viewX) < 0.5) {
      this.view = to;
      this.viewX = toX;
      this.glide = false;
    }
    const w = innerWidth;
    const h = innerHeight;
    const shift = Math.round(this.view);
    const shiftX = Math.round(this.viewX);
    if (shift || shiftX) this.camera.setViewOffset(w, h, shiftX, shift, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  // Resizing the drawing buffer clears it, so it only ever happens right before a render:
  // anywhere else the browser can put that cleared, black buffer on screen.
  fit() {
    const b = this.buffer;
    const w = innerWidth;
    const h = innerHeight;
    if (w === b.w && h === b.h && this.dpr === b.dpr) return;
    b.w = w;
    b.h = h;
    b.dpr = this.dpr;
    this.renderer.setDrawingBufferSize(w, h, this.dpr);
  }

  frame(deltaMs) {
    if (coarse) {
      // A phone draws at most about 60 times a second: on a 90 or 120 Hz screen, every other
      // refresh. The shortest recent interval is the screen's own, even while frames run late.
      if (deltaMs > 4) this.vsync = Math.min(deltaMs, (this.vsync || deltaMs) * 1.02);
      this.stride = this.vsync < 12.5 ? 2 : 1;
      this.owed = (this.owed || 0) + deltaMs;
      if (this.stride === 2 && (this.skip = !this.skip)) return;
      deltaMs = this.owed;
      this.owed = 0;
    }
    const real = Math.min(deltaMs / 1000, 0.1);
    const dt = Math.min(real, 0.05) * this.timeScale;
    this.time += dt;
    for (const h of this.hooks) h(dt, this.time, real);
    if (this.glide) this.offset(real);
    const r = this.renderer;
    this.fit();
    if (this.worldOn) r.render(this.scene, this.camera);
    else {
      r.setClearColor(this.back, this.alpha ? 0 : 1);
      r.clear();
    }
    for (const o of this.overlays) {
      if (!o.active) continue;
      r.autoClear = false;
      r.clearDepth();
      r.render(o.scene, o.camera);
      r.autoClear = true;
    }
    if (this.adaptive) this.adapt(real);
  }

  // Trades resolution for frame rate a quarter step at a time. The median ignores one-off
  // hitches, and a step up that has to be taken back makes the next attempt wait twice as long.
  adapt(real) {
    const f = this.frames;
    f.push(real);
    if (f.length < 60) return;
    f.sort((a, b) => a - b);
    const mid = f[30];
    f.length = 0;
    if (document.hidden) return;
    this.sinceUp++;
    // A phone is measured against the pace it draws at, so skipping refreshes by design is not
    // taken for running slow.
    const pace = coarse && (this.stride * this.vsync) / 1000;
    if (mid > (pace ? pace * 1.33 : 1 / 45) && this.dpr > this.floor) {
      this.dpr = Math.max(this.floor, this.dpr - 0.25);
      if (this.sinceUp < 4) this.patience = Math.min(this.patience * 2, 120);
      this.good = 0;
    } else if (mid < (pace ? pace * 1.07 : 1 / 56) && this.dpr < this.cap) {
      if (++this.good >= this.patience) {
        this.good = 0;
        this.sinceUp = 0;
        this.dpr = Math.min(this.cap, this.dpr + 0.25);
      }
    } else this.good = 0;
  }
}
