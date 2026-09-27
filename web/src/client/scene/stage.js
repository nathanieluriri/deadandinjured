import * as THREE from "three";
import { gsap } from "gsap/gsap-core";

const coarse = matchMedia("(pointer: coarse)").matches;

export class Stage {
  constructor(canvas, { alpha = false } = {}) {
    const film = /[?&]film\b/.test(location.search);
    const dpr = window.devicePixelRatio || 1;
    this.cap = film ? dpr : Math.min(dpr, coarse ? 2.5 : 2);
    this.floor = Math.min(this.cap, coarse ? 1.25 : 1);
    this.dpr = Math.min(this.cap, 2);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha, powerPreference: "high-performance", stencil: false });
    this.alpha = alpha;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1200);
    this.hooks = [];
    this.restores = [];
    this.timeScale = 1;
    this.inset = { top: 0, bottom: 0 };
    this.view = 0;
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
    return innerWidth / Math.max(1, innerHeight - this.inset.bottom * 0.6);
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.offset();
    this.onResize?.();
  }

  setInset(top, bottom, glide = false) {
    if (top === this.inset.top && bottom === this.inset.bottom) return;
    this.inset = { top, bottom };
    this.glide = glide && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.offset();
    this.onResize?.();
  }

  // Keeps the focal point centred in the part of the screen the panels leave open. A glide
  // eases there over half a second instead of jumping, for panels that arrive during a shot.
  offset(real = 0) {
    const to = (this.inset.bottom - this.inset.top) / 2;
    const k = this.glide && real ? 1 - Math.exp(-real * 5) : this.glide ? 0 : 1;
    this.view += (to - this.view) * k;
    if (Math.abs(to - this.view) < 0.5) {
      this.view = to;
      this.glide = false;
    }
    const w = innerWidth;
    const h = innerHeight;
    const shift = Math.round(this.view);
    if (shift) this.camera.setViewOffset(w, h, 0, shift, w, h);
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
    if (mid > 1 / 45 && this.dpr > this.floor) {
      this.dpr = Math.max(this.floor, this.dpr - 0.25);
      if (this.sinceUp < 4) this.patience = Math.min(this.patience * 2, 120);
      this.good = 0;
    } else if (mid < 1 / 56 && this.dpr < this.cap) {
      if (++this.good >= this.patience) {
        this.good = 0;
        this.sinceUp = 0;
        this.dpr = Math.min(this.cap, this.dpr + 0.25);
      }
    } else this.good = 0;
  }
}
