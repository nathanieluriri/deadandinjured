import * as THREE from "three";
import { gsap } from "gsap";

const coarse = matchMedia("(pointer: coarse)").matches;

export class Stage {
  constructor(canvas, { alpha = false } = {}) {
    const film = /[?&]film\b/.test(location.search);
    const cap = film ? window.devicePixelRatio || 1 : Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 1.75);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: cap < 1.5 || alpha, alpha, powerPreference: "high-performance", stencil: false });
    this.alpha = alpha;
    this.renderer.setPixelRatio(cap);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1200);
    this.cap = cap;
    this.dpr = cap;
    this.hooks = [];
    this.timeScale = 1;
    this.inset = { top: 0, bottom: 0 };
    this.time = 0;
    this.frames = [];
    this.worldOn = true;
    this.overlay = null;
    this.back = new THREE.Color(0x0c0d12);
    this.adaptive = !window.__vclock && !/[?&]hq\b/.test(location.search);
    this.resize();
    addEventListener("resize", () => this.resize());
    gsap.ticker.add((time, deltaMs) => this.frame(deltaMs));
  }

  get aspect() {
    return innerWidth / Math.max(1, innerHeight - this.inset.bottom * 0.6);
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.offset();
    this.onResize?.();
  }

  setInset(top, bottom) {
    if (top === this.inset.top && bottom === this.inset.bottom) return;
    this.inset = { top, bottom };
    this.offset();
    this.onResize?.();
  }

  // Keeps the focal point centred in the part of the screen the panels leave open.
  offset() {
    const w = innerWidth;
    const h = innerHeight;
    const shift = Math.round((this.inset.bottom - this.inset.top) / 2);
    if (shift) this.camera.setViewOffset(w, h, 0, shift, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  frame(deltaMs) {
    const real = Math.min(deltaMs / 1000, 0.1);
    const dt = Math.min(real, 0.05) * this.timeScale;
    this.time += dt;
    for (const h of this.hooks) h(dt, this.time, real);
    const r = this.renderer;
    if (this.worldOn) r.render(this.scene, this.camera);
    else {
      r.setClearColor(this.back, this.alpha ? 0 : 1);
      r.clear();
    }
    if (this.overlay?.active) {
      r.autoClear = false;
      r.clearDepth();
      r.render(this.overlay.scene, this.overlay.camera);
      r.autoClear = true;
    }
    if (this.adaptive) this.adapt(real);
  }

  adapt(real) {
    this.frames.push(real);
    if (this.frames.length < 90) return;
    const avg = this.frames.reduce((a, b) => a + b, 0) / this.frames.length;
    this.frames.length = 0;
    if (document.hidden) return;
    if (avg > 1 / 42 && this.dpr > 1) this.setDpr(Math.max(1, this.dpr - 0.25));
    else if (avg < 1 / 57 && this.dpr < this.cap) {
      this.good = (this.good || 0) + 1;
      if (this.good > 6) {
        this.good = 0;
        this.setDpr(Math.min(this.cap, this.dpr + 0.25));
      }
    } else this.good = 0;
  }

  setDpr(v) {
    this.dpr = v;
    this.renderer.setPixelRatio(v);
    this.renderer.setSize(innerWidth, innerHeight, false);
  }
}
