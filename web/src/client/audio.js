// Every sound in the game is synthesised here with the Web Audio API: nothing is downloaded.
const DTMF = {
  1: [697, 1209], 2: [697, 1336], 3: [697, 1477], 4: [770, 1209], 5: [770, 1336],
  6: [770, 1477], 7: [852, 1209], 8: [852, 1336], 9: [852, 1477], 0: [941, 1336],
};
const NOTE = { G3: 196, C4: 261.63, E4: 329.63, G4: 392, C5: 523.25, E5: 659.25, G5: 783.99, C3: 130.81, E3: 164.81 };
const rnd = (a, b) => a + Math.random() * (b - a);

let store = null;
try { store = window.localStorage; } catch {}

export class Sfx {
  constructor() {
    this.ctx = null;
    const pref = (k) => {
      try { return store?.getItem(k); } catch { return null; }
    };
    this.enabled = pref("di.sound") !== "off";
    this.effects = pref("di.effects") !== "off";
    this.music = pref("di.music") !== "off";
    this.moodName = "silent";
    this.step = 0;
    this.lastHover = 0;
  }

  get ready() {
    return !!this.ctx && this.ctx.state === "running";
  }

  unlock() {
    if (this.ctx) {
      if (this.enabled && this.ctx.state !== "running") this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: "interactive" });
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.9 : 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;
    this.master.connect(comp).connect(ctx.destination);
    this.bus = ctx.createGain();
    this.bus.gain.value = this.effects ? 1 : 0;
    this.bus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.music ? 0.55 : 0;
    this.musicBus.connect(this.master);
    this.ambBus = ctx.createGain();
    this.ambBus.gain.value = this.effects ? 0.7 : 0;
    this.ambBus.connect(this.master);
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(2.8);
    const vg = ctx.createGain();
    vg.gain.value = 0.42;
    this.verb.connect(vg).connect(this.master);
    // The reverb is shared, so each side of the mix sends to it through its own switch.
    this.fxSend = ctx.createGain();
    this.fxSend.gain.value = this.effects ? 1 : 0;
    this.fxSend.connect(this.verb);
    this.musicSend = ctx.createGain();
    this.musicSend.gain.value = this.music ? 1 : 0;
    this.musicSend.connect(this.verb);
    this.white = this.noise(2, "white");
    this.brown = this.noise(4, "brown");
    this.ambience();
    this.place(this.placeName);
    this.scheduler = setInterval(() => this.schedule(), 25);
    this.nextStep = ctx.currentTime + 0.1;
    document.addEventListener("visibilitychange", () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend();
      else if (this.enabled && !this.frozen) this.ctx.resume();
    });
  }

  setEffects(on) {
    this.effects = on;
    try { store?.setItem("di.effects", on ? "on" : "off"); } catch {}
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.bus.gain.setTargetAtTime(on ? 1 : 0, t, 0.05);
    this.ambBus.gain.setTargetAtTime(on ? 0.7 : 0, t, 0.05);
    this.fxSend.gain.setTargetAtTime(on ? 1 : 0, t, 0.05);
  }

  setMusic(on) {
    this.music = on;
    try { store?.setItem("di.music", on ? "on" : "off"); } catch {}
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(on ? 0.55 : 0, t, 0.05);
    this.musicSend.gain.setTargetAtTime(on ? 1 : 0, t, 0.05);
  }

  // Pausing a match against the computer stops the sound with everything else, mid-note.
  freeze(on) {
    this.frozen = on;
    if (!this.ctx) return;
    if (on) this.ctx.suspend();
    else if (this.enabled && !document.hidden) this.ctx.resume();
  }

  setEnabled(on) {
    this.enabled = on;
    try { store?.setItem("di.sound", on ? "on" : "off"); } catch {}
    if (!this.ctx) return;
    if (on && this.ctx.state !== "running") this.ctx.resume();
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(on ? 0.9 : 0, t, 0.05);
  }

  mood(name) {
    this.moodName = name;
  }

  // Each place on the title sounds like itself: wind in the open trench, a stove ticking in
  // the dugouts, static and call signs at the radio post.
  place(name) {
    this.placeName = name;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const inside = name === "war" || name === "signals";
    this.windLevel.gain.setTargetAtTime(inside ? 0.3 : 1, t, 0.5);
    this.staticGain.gain.setTargetAtTime(name === "radio" ? 0.035 : 0, t, 0.4);
  }

  play(name, o = {}) {
    if (!this.ctx || !this.enabled || !this.effects || this.ctx.state !== "running") return;
    const f = this[`s_${name}`];
    if (!f) return;
    try { f.call(this, o, this.ctx.currentTime + (o.delay || 0)); } catch (e) { console.warn("sound", name, e); }
  }

  // ---- building blocks --------------------------------------------------------------------

  noise(sec, kind) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === "brown") {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  impulse(sec) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let y = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const a = 0.9 - t * 0.8;
        y += a * ((Math.random() * 2 - 1) - y);
        d[i] = i < ctx.sampleRate * 0.012 ? 0 : y * Math.pow(1 - t, 2.6);
      }
    }
    return buf;
  }

  // Output stage for one voice: gain, pan, a distance filter and a send to the reverb.
  out(o = {}, t, { verb = 0.25, gain = 1 } = {}) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = gain * (o.gain ?? 1) * (o.far ? 1 - o.far * 0.45 : 1);
    let node = g;
    if (o.far) {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 5200 - o.far * 4600;
      node.connect(lp);
      node = lp;
    }
    if (o.pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      node.connect(p);
      node = p;
    }
    node.connect(o.bus || this.bus);
    const send = ctx.createGain();
    send.gain.value = verb + (o.far || 0) * 0.35;
    node.connect(send).connect(o.bus === this.musicBus ? this.musicSend : this.fxSend);
    return g;
  }

  env(param, t, a, peak, d, floor = 0.0001) {
    param.cancelScheduledValues(t);
    param.setValueAtTime(floor, t);
    param.linearRampToValueAtTime(peak, t + a);
    param.exponentialRampToValueAtTime(floor, t + a + d);
  }

  osc(type, freq, t, dur, dest, { to = null, curve = "exp", detune = 0 } = {}) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) {
      if (curve === "exp") o.frequency.exponentialRampToValueAtTime(to, t + dur);
      else o.frequency.linearRampToValueAtTime(to, t + dur);
    }
    o.detune.value = detune;
    o.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  noiseSrc(t, dur, dest, buf = this.white) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.connect(dest);
    const off = Math.random() * Math.max(0, buf.duration - dur - 0.1);
    s.start(t, off, dur + 0.05);
    return s;
  }

  filter(type, freq, q = 0.7, to = null, t = 0, dur = 0) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.Q.value = q;
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    return f;
  }

  vca(t, a, peak, d, dest) {
    const g = this.ctx.createGain();
    this.env(g.gain, t, a, peak, d);
    g.connect(dest);
    return g;
  }

  thump(t, dest, f0 = 110, f1 = 38, dur = 0.5, peak = 1) {
    const v = this.vca(t, 0.004, peak, dur, dest);
    this.osc("sine", f0, t, dur, v, { to: f1 });
  }

  hiss(t, dest, { type = "lowpass", f = 1500, to = null, q = 0.7, a = 0.003, peak = 0.8, d = 0.4, buf } = {}) {
    const v = this.vca(t, a, peak, d, dest);
    const fl = this.filter(type, f, q, to, t, a + d);
    fl.connect(v);
    this.noiseSrc(t, a + d, fl, buf);
  }

  voice(t, dest, { f0 = 130, f1 = 100, dur = 0.35, formants = [650, 1100, 2600], peak = 0.5, breath = 0.3 }) {
    const v = this.vca(t, 0.02, peak, dur, dest);
    const sum = this.ctx.createGain();
    const gains = [1, 0.55, 0.28];
    formants.forEach((f, i) => {
      const bp = this.filter("bandpass", f, 7);
      const g = this.ctx.createGain();
      g.gain.value = gains[i] * 2.4;
      sum.connect(bp).connect(g).connect(v);
    });
    const o = this.osc("sawtooth", f0, t, dur, sum, { to: f1 });
    const vib = this.ctx.createOscillator();
    vib.frequency.value = 6;
    const vg = this.ctx.createGain();
    vg.gain.value = f0 * 0.03;
    vib.connect(vg).connect(o.frequency);
    vib.start(t);
    vib.stop(t + dur + 0.05);
    if (breath) {
      const n = this.ctx.createGain();
      n.gain.value = breath;
      n.connect(sum);
      this.noiseSrc(t, dur, n);
    }
  }

  brass(t, dest, freq, dur, peak = 0.22) {
    const ctx = this.ctx;
    const v = ctx.createGain();
    v.gain.setValueAtTime(0.0001, t);
    v.gain.linearRampToValueAtTime(peak, t + 0.035);
    v.gain.setTargetAtTime(peak * 0.7, t + 0.05, Math.max(0.05, dur * 0.3));
    v.gain.setTargetAtTime(0.0001, t + dur * 0.85, 0.05);
    v.connect(dest);
    dur += 0.25;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 2;
    lp.frequency.setValueAtTime(freq * 1.2, t);
    lp.frequency.linearRampToValueAtTime(freq * 6, t + 0.06);
    lp.frequency.setTargetAtTime(freq * 3.4, t + 0.08, 0.2);
    lp.connect(v);
    const o1 = this.osc("sawtooth", freq, t, dur, lp);
    const o2 = this.osc("sawtooth", freq, t, dur, lp, { detune: 7 });
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.2;
    const vg = ctx.createGain();
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(freq * 0.012, t + Math.min(0.4, dur));
    vib.connect(vg);
    vg.connect(o1.frequency);
    vg.connect(o2.frequency);
    vib.start(t);
    vib.stop(t + dur + 0.05);
  }

  bell(t, dest, f, dur = 3.2, peak = 0.3) {
    const parts = [[0.5, 1, 1.4], [1, 0.9, 1], [1.19, 0.5, 0.8], [1.5, 0.45, 0.7], [2, 0.5, 0.55], [2.52, 0.3, 0.4], [3.01, 0.22, 0.3], [4.1, 0.14, 0.2]];
    for (const [ratio, g, life] of parts) {
      const v = this.vca(t, 0.002, peak * g, dur * life, dest);
      this.osc("sine", f * ratio, t, dur * life, v, { detune: rnd(-4, 4) });
    }
    this.hiss(t, dest, { type: "bandpass", f: 3200, q: 1.5, peak: 0.25, d: 0.03 });
  }

  // ---- the arsenal ------------------------------------------------------------------------

  s_boom(o, t) {
    t += o.far ? 0.12 : 0;
    const out = this.out(o, t, { verb: 0.3, gain: o.far ? 0.8 : 1.05 });
    const p = 1 + ((o.n || 0) % 4) * 0.04 + rnd(-0.03, 0.03);
    this.thump(t, out, 105 * p, 36, 0.8, 1);
    this.hiss(t, out, { f: 2200, to: 260, peak: 0.95, d: 0.7 });
    this.hiss(t, out, { type: "highpass", f: 2500, peak: 0.35, d: 0.05 });
  }

  s_whistle(o, t) {
    const dur = o.dur || 1.1;
    const out = this.out(o, t, { verb: 0.3, gain: o.incoming ? 0.2 : 0.09 });
    const v = this.ctx.createGain();
    v.gain.setValueAtTime(0.0001, t);
    v.gain.exponentialRampToValueAtTime(1, t + dur * 0.4);
    v.gain.setValueAtTime(1, t + dur * 0.92);
    v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    v.connect(out);
    const f0 = (o.incoming ? 2100 : 1500) * (1 + (o.n || 0) * 0.035);
    const f1 = o.incoming ? 520 : 900;
    const a = this.osc("sine", f0, t, dur, v, { to: f1 });
    const b2 = this.ctx.createGain();
    b2.gain.value = 0.18;
    b2.connect(v);
    this.osc("sine", f0 * 1.5, t, dur, b2, { to: f1 * 1.5 });
    const vib = this.ctx.createOscillator();
    vib.frequency.value = 9 + (o.n || 0);
    const vg = this.ctx.createGain();
    vg.gain.value = 18;
    vib.connect(vg).connect(a.frequency);
    vib.start(t);
    vib.stop(t + dur);
    const air = this.ctx.createGain();
    air.gain.value = 0.25;
    air.connect(v);
    const bp = this.filter("bandpass", f0, 3, f1, t, dur);
    bp.connect(air);
    this.noiseSrc(t, dur, bp);
  }

  s_burst(o, t) {
    const out = this.out(o, t, { verb: 0.5, gain: 0.9 });
    this.thump(t, out, 88, 34, 0.9, 0.9);
    this.hiss(t, out, { type: "bandpass", f: 1400, to: 300, q: 0.6, peak: 1, d: 0.8 });
    this.hiss(t, out, { type: "highpass", f: 3000, peak: 0.5, d: 0.08 });
    for (let i = 0; i < 10; i++) {
      this.hiss(t + 0.08 + Math.random() * 0.7, out, { type: "bandpass", f: rnd(1800, 5200), q: 2, peak: rnd(0.05, 0.16), d: rnd(0.01, 0.04) });
    }
  }

  s_impact(o, t) {
    t += o.far ? 0.25 : 0;
    const out = this.out(o, t, { verb: 0.45, gain: o.far ? 0.9 : 1.1 });
    this.thump(t, out, 64, 26, 1.3, 1);
    this.hiss(t, out, { f: 2600, to: 140, peak: 1, d: 1.2 });
    this.hiss(t + 0.15, out, { f: 900, to: 200, peak: 0.35, d: 1.6, buf: this.brown });
  }

  s_death(o, t) {
    const out = this.out(o, t, { verb: 0.2, gain: 0.8 });
    const n = o.n || 0;
    const f0 = 118 + (n % 4) * 11 + rnd(-6, 6);
    this.voice(t + 0.02, out, { f0, f1: f0 * 0.62, dur: 0.42, formants: [620, 1080, 2500], peak: 0.42 });
    this.thump(t, out, 160, 55, 0.18, 0.7);
    this.hiss(t, out, { type: "bandpass", f: 900, q: 1, peak: 0.4, d: 0.09 });
  }

  s_injured(o, t) {
    const out = this.out(o, t, { verb: 0.2, gain: 0.75 });
    const f0 = 165 + ((o.n || 0) % 4) * 12;
    this.voice(t, out, { f0, f1: f0 * 1.25, dur: 0.14, formants: [780, 1240, 2750], peak: 0.38, breath: 0.4 });
    this.voice(t + 0.13, out, { f0: f0 * 1.25, f1: f0 * 0.8, dur: 0.3, formants: [760, 1200, 2700], peak: 0.36, breath: 0.35 });
  }

  s_thud(o, t) {
    const out = this.out(o, t, { verb: 0.15, gain: 0.8 });
    this.thump(t, out, 120, 45, 0.28, 0.9);
    this.hiss(t, out, { f: 700, peak: 0.5, d: 0.16, buf: this.brown });
  }

  s_toll(o, t) {
    const out = this.out(o, t, { verb: 0.7, gain: 0.55 });
    this.bell(t, out, 146.8 * Math.pow(0.944, o.n || 0), 3.4, 0.3);
  }

  s_siren(o, t) {
    const out = this.out({ ...o, far: 0.3 }, t, { verb: 0.6, gain: 0.12 });
    const v = this.ctx.createGain();
    v.gain.setValueAtTime(0.0001, t);
    v.gain.exponentialRampToValueAtTime(1, t + 0.35);
    v.gain.setValueAtTime(1, t + 1.1);
    v.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
    const lp = this.filter("lowpass", 1500, 1);
    lp.connect(v).connect(out);
    for (const [type, det] of [["sawtooth", 0], ["square", 12]]) {
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.detune.value = det;
      osc.frequency.setValueAtTime(230, t);
      osc.frequency.exponentialRampToValueAtTime(560, t + 0.9);
      osc.frequency.exponentialRampToValueAtTime(330, t + 1.7);
      osc.connect(lp);
      osc.start(t);
      osc.stop(t + 1.75);
    }
  }

  s_stamp(o, t) {
    const out = this.out(o, t, { verb: 0.25, gain: 0.9 });
    this.thump(t, out, 95, 42, 0.32, 1);
    this.hiss(t, out, { type: "highpass", f: 900, peak: 0.55, d: 0.07 });
    const v = this.vca(t, 0.002, 0.3, 0.09, out);
    this.osc("triangle", 185, t, 0.09, v);
  }

  s_clack(o, t) {
    const out = this.out(o, t, { verb: 0.18, gain: 0.7 });
    const p = 1 + (o.n || 0) * 0.06;
    for (const [f, g] of [[390 * p, 0.6], [1180 * p, 0.25]]) {
      const v = this.vca(t, 0.001, g, 0.07, out);
      this.osc("sine", f, t, 0.08, v);
    }
    this.hiss(t, out, { type: "bandpass", f: 2600, q: 1.2, peak: 0.35, d: 0.018 });
  }

  s_lock(o, t) {
    const out = this.out(o, t, { verb: 0.35, gain: 0.8 });
    this.thump(t, out, 140, 50, 0.22, 0.9);
    for (const [f, g, d] of [[520, 0.2, 0.5], [1383, 0.12, 0.35], [2210, 0.08, 0.25]]) {
      const v = this.vca(t + 0.01, 0.002, g, d, out);
      this.osc("sine", f, t + 0.01, d, v);
    }
    this.hiss(t + 0.09, out, { type: "bandpass", f: 3400, q: 2, peak: 0.3, d: 0.02 });
  }

  s_drum(o, t) {
    const out = this.out(o, t, { verb: 0.4, gain: 1 });
    const n = o.n || 0;
    this.thump(t, out, 128 + n * 14, 58, 0.45, 1);
    this.hiss(t, out, { f: 500, peak: 0.6, d: 0.12 });
    this.hiss(t, out, { type: "bandpass", f: 2000, q: 1, peak: 0.2, d: 0.05 });
  }

  s_pop(o, t) {
    const out = this.out(o, t, { verb: 0.2, gain: 0.5 });
    const v = this.vca(t, 0.002, 0.8, 0.12, out);
    this.osc("sine", 380, t, 0.12, v, { to: 960 });
  }

  s_clash(o, t) {
    const out = this.out(o, t, { verb: 0.55, gain: 0.8 });
    this.hiss(t, out, { type: "highpass", f: 1800, peak: 0.7, d: 0.12 });
    for (const [f, g, d] of [[310, 0.3, 0.8], [787, 0.22, 0.6], [1312, 0.16, 0.5], [2027, 0.1, 0.4], [3105, 0.06, 0.3]]) {
      const v = this.vca(t, 0.001, g, d, out);
      this.osc("sine", f, t, d, v);
    }
    this.thump(t, out, 90, 40, 0.3, 0.8);
  }

  s_shatter(o, t) {
    const out = this.out(o, t, { verb: 0.3, gain: 0.7 });
    for (let i = 0; i < 22; i++) {
      this.hiss(t + Math.random() * 0.45, out, { type: "bandpass", f: rnd(1800, 7000), q: 3, peak: rnd(0.15, 0.4), d: rnd(0.02, 0.07) });
    }
  }

  s_misfire(o, t) {
    const out = this.out(o, t, { verb: 0.3, gain: 0.8 });
    const v = this.vca(t, 0.001, 0.4, 0.2, out);
    this.osc("square", 820, t, 0.05, v);
    this.thump(t + 0.08, out, 90, 50, 0.3, 0.6);
    this.hiss(t + 0.1, out, { f: 1200, to: 300, peak: 0.3, d: 1.1 });
  }

  s_ricochet(o, t) {
    const out = this.out(o, t, { verb: 0.35, gain: 0.3 });
    const v = this.vca(t, 0.003, 0.6, 0.38, out);
    const osc = this.osc("sine", rnd(2600, 3200), t, 0.4, v, { to: rnd(900, 1300) });
    const fm = this.ctx.createOscillator();
    fm.frequency.value = 38;
    const fg = this.ctx.createGain();
    fg.gain.value = 120;
    fm.connect(fg).connect(osc.frequency);
    fm.start(t);
    fm.stop(t + 0.4);
    this.hiss(t, out, { type: "highpass", f: 3000, peak: 0.4, d: 0.03 });
  }

  s_reinforce(o, t) {
    const out = this.out({ ...o, far: 0.2 }, t, { verb: 0.2, gain: 0.6 });
    const steps = Math.min(8, 2 + (o.n || 1) * 2);
    for (let i = 0; i < steps; i++) {
      const at = t + i * 0.16 + rnd(0, 0.02);
      this.hiss(at, out, { f: 480, peak: 0.55, d: 0.07, buf: this.brown });
      this.thump(at, out, 85, 50, 0.08, 0.35);
    }
    this.brass(t + steps * 0.16, out, NOTE.G4, 0.16, 0.12);
    this.brass(t + steps * 0.16 + 0.17, out, NOTE.C5, 0.3, 0.12);
  }

  s_key(o, t) {
    const out = this.out(o, t, { verb: 0.05, gain: 0.5 });
    const [a, b] = DTMF[o.digit] || DTMF[0];
    const v = this.vca(t, 0.003, 0.22, 0.1, out);
    this.osc("sine", a, t, 0.1, v);
    this.osc("sine", b, t, 0.1, v);
    this.hiss(t, out, { type: "bandpass", f: 3000, q: 1, peak: 0.25, d: 0.012 });
  }

  s_del(o, t) {
    const out = this.out(o, t, { verb: 0.05, gain: 0.4 });
    const v = this.vca(t, 0.002, 0.35, 0.09, out);
    this.osc("triangle", 520, t, 0.09, v, { to: 260 });
  }

  s_error(o, t) {
    const out = this.out(o, t, { verb: 0.1, gain: 0.25 });
    const lp = this.filter("lowpass", 900);
    const v = this.vca(t, 0.005, 0.5, 0.2, out);
    lp.connect(v);
    this.osc("square", 138, t, 0.22, lp);
    this.osc("square", 146, t, 0.22, lp);
  }

  s_click(o, t) {
    const out = this.out(o, t, { verb: 0.05, gain: 0.35 });
    this.hiss(t, out, { type: "bandpass", f: 3500, q: 1.4, peak: 0.5, d: 0.012 });
    const v = this.vca(t, 0.001, 0.25, 0.04, out);
    this.osc("sine", 1250, t, 0.04, v);
  }

  // A sheet slid out of a folder: a rising brush of paper.
  s_paper(o, t) {
    const out = this.out(o, t, { verb: 0.08, gain: 0.35 });
    this.hiss(t, out, { type: "bandpass", f: 1400, to: 4200, q: 0.9, a: 0.02, peak: 0.55, d: 0.16 });
    this.hiss(t + 0.03, out, { type: "highpass", f: 5200, peak: 0.18, d: 0.08 });
  }

  // Folded away: shorter, falling.
  s_paperOff(o, t) {
    const out = this.out(o, t, { verb: 0.06, gain: 0.3 });
    this.hiss(t, out, { type: "bandpass", f: 3600, to: 1200, q: 0.9, a: 0.01, peak: 0.5, d: 0.11 });
  }

  // Knuckles on a crate lid.
  s_knock(o, t) {
    const out = this.out(o, t, { verb: 0.12, gain: 0.5 });
    for (const [dt, f] of [[0, 210], [0.085, 190]]) {
      this.thump(t + dt, out, f, f * 0.7, 0.09, 0.8);
      const v = this.vca(t + dt, 0.001, 0.25, 0.05, out);
      this.osc("triangle", f * 2.7, t + dt, 0.05, v);
      this.hiss(t + dt, out, { type: "bandpass", f: 1800, q: 1.5, peak: 0.25, d: 0.02 });
    }
  }

  // A field telephone's bell: a clapper between two small bells, two bursts and a pause.
  s_ring(o, t) {
    const out = this.out(o, t, { verb: 0.3, gain: 0.26 });
    for (const [start, len] of [[0, 0.45], [0.65, 0.45]]) {
      for (let i = 0; i * 0.045 < len; i++) {
        const at = t + start + i * 0.045;
        const f = i % 2 ? 2350 : 1980;
        for (const [ratio, g, d] of [[1, 0.5, 0.16], [2.76, 0.18, 0.08], [5.4, 0.07, 0.05]]) {
          const v = this.vca(at, 0.001, g, d, out);
          this.osc("sine", f * ratio, at, d, v);
        }
      }
    }
  }

  // Cranking the handle to call the exchange: a ratchet and the whir of the magneto.
  s_crank(o, t) {
    const out = this.out(o, t, { verb: 0.15, gain: 0.45 });
    for (let i = 0; i < 9; i++) {
      const at = t + i * 0.06 + (i % 3) * 0.01;
      this.hiss(at, out, { type: "bandpass", f: 2400 + (i % 2) * 500, q: 3, peak: 0.35, d: 0.02 });
    }
    const lp = this.filter("lowpass", 600, 1);
    lp.connect(this.vca(t, 0.08, 0.12, 0.6, out));
    this.osc("sawtooth", 70, t, 0.6, lp, { to: 150 });
  }

  // The telegraph sounder as the strips come off the tape.
  s_morse(o, t) {
    const out = this.out(o, t, { verb: 0.12, gain: 0.35 });
    let at = t;
    for (const len of o.pattern || [1, 3, 1, 1, 3, 3, 1]) {
      for (const [dt, f] of [[0, 900], [len * 0.06, 700]]) {
        const bp = this.filter("bandpass", f * 2, 2);
        bp.connect(this.vca(at + dt, 0.001, 0.4, 0.025, out));
        this.osc("square", f, at + dt, 0.025, bp);
      }
      at += len * 0.06 + 0.07;
    }
  }

  // A boot on the duckboards, with a little grit.
  s_step(o, t) {
    const out = this.out({ pan: rnd(-0.25, 0.25) }, t, { verb: 0.08, gain: 0.3 });
    this.thump(t, out, rnd(120, 150), 60, 0.1, 0.55);
    this.hiss(t, out, { type: "bandpass", f: rnd(700, 1100), q: 1.1, peak: 0.3, d: 0.08 });
  }

  // Canvas unrolling and snapping taut.
  s_unfurl(o, t) {
    const out = this.out(o, t, { verb: 0.2, gain: 0.35 });
    this.hiss(t, out, { type: "bandpass", f: 500, to: 1600, q: 0.8, a: 0.25, peak: 0.5, d: 0.6 });
    this.hiss(t + 0.9, out, { type: "bandpass", f: 900, q: 1.5, peak: 0.8, d: 0.12 });
  }

  s_hover(o, t) {
    const now = performance.now();
    if (now - this.lastHover < 60) return;
    this.lastHover = now;
    const out = this.out(o, t, { verb: 0.1, gain: 0.12 });
    const v = this.vca(t, 0.001, 0.3, 0.03, out);
    this.osc("sine", 2300, t, 0.03, v);
  }

  s_tick(o, t) {
    const out = this.out(o, t, { verb: 0.15, gain: 0.3 });
    const v = this.vca(t, 0.001, 0.6, 0.05, out);
    this.osc("sine", o.hi ? 1180 : 880, t, 0.05, v);
    this.hiss(t, out, { type: "bandpass", f: 2400, q: 2, peak: 0.2, d: 0.01 });
  }

  s_rumble(o, t) {
    const out = this.out(o, t, { verb: 0.4, gain: 0.8 });
    this.hiss(t, out, { f: 300, a: 0.3, peak: 0.9, d: 1.5, buf: this.brown });
    this.thump(t, out, 55, 30, 1.6, 0.5);
  }

  s_bugle(o, t) {
    const out = this.out(o, t, { verb: 0.45, gain: 0.8 });
    this.brass(t, out, NOTE.C4, 0.14);
    this.brass(t + 0.15, out, NOTE.G4, 0.14);
    this.brass(t + 0.3, out, NOTE.C5, 0.5);
  }

  s_radio(o, t) {
    const out = this.out(o, t, { verb: 0.1, gain: 0.35 });
    this.hiss(t, out, { type: "bandpass", f: 1900, q: 2.5, peak: 0.45, d: 0.16 });
    const v = this.vca(t + 0.02, 0.002, 0.25, 0.05, out);
    this.osc("sine", 1200, t + 0.02, 0.05, v, { to: 2400 });
    for (let i = 0; i < 3; i++) {
      const b = this.vca(t + 0.22 + i * 0.11, 0.003, 0.18, 0.05, out);
      this.osc("sine", 820, t + 0.22 + i * 0.11, 0.06, b);
    }
  }

  s_aim(o, t) {
    const out = this.out({ ...o, far: 0.5 }, t, { verb: 0.2, gain: 0.25 });
    this.hiss(t, out, { type: "bandpass", f: 2400, q: 3, peak: 0.4, d: 0.025 });
    const v = this.vca(t + 0.03, 0.001, 0.2, 0.03, out);
    this.osc("square", 420, t + 0.03, 0.03, v);
  }

  s_recon(o, t) {
    const out = this.out(o, t, { verb: 0.6, gain: 0.35 });
    for (let i = 0; i < 2; i++) {
      const v = this.vca(t + i * 0.45, 0.003, 0.55 - i * 0.2, 0.8, out);
      this.osc("sine", 1320, t + i * 0.45, 0.8, v);
    }
  }

  s_yes(o, t) {
    const out = this.out(o, t, { verb: 0.3, gain: 0.35 });
    for (const [i, f] of [[0, 880], [1, 1320]]) {
      const v = this.vca(t + i * 0.12, 0.003, 0.5, 0.12, out);
      this.osc("triangle", f, t + i * 0.12, 0.13, v);
    }
  }

  s_no(o, t) {
    const out = this.out(o, t, { verb: 0.3, gain: 0.35 });
    for (const [i, f] of [[0, 660], [1, 440]]) {
      const v = this.vca(t + i * 0.14, 0.003, 0.5, 0.14, out);
      this.osc("triangle", f, t + i * 0.14, 0.15, v);
    }
  }

  s_sniper(o, t) {
    const out = this.out(o, t, { verb: 0.7, gain: 0.8 });
    this.hiss(t, out, { type: "bandpass", f: 400, to: 3200, q: 2, a: 0.25, peak: 0.25, d: 0.05 });
    const c = t + 0.35;
    this.hiss(c, out, { type: "highpass", f: 1400, peak: 1, d: 0.06 });
    this.thump(c, out, 190, 60, 0.12, 0.7);
    this.hiss(c + 0.5, out, { type: "lowpass", f: 1400, peak: 0.2, d: 0.3 });
  }

  s_smoke(o, t) {
    const out = this.out(o, t, { verb: 0.35, gain: 0.7 });
    this.thump(t, out, 150, 60, 0.18, 0.6);
    const v = this.vca(t, 0.001, 0.3, 0.03, out);
    this.osc("square", 1600, t, 0.03, v);
    this.hiss(t + 0.08, out, { type: "highpass", f: 2800, a: 0.15, peak: 0.45, d: 2.2 });
  }

  // A spotter plane passing overhead: two detuned saws under a lowpass that opens as it nears.
  s_plane(o, t) {
    const dur = o.dur || 3.6;
    const out = this.out(o, t, { verb: 0.35, gain: 0.55 });
    const lp = this.filter("lowpass", 380, 1.1);
    lp.frequency.setValueAtTime(380, t);
    lp.frequency.linearRampToValueAtTime(1500, t + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(420, t + dur);
    const v = this.ctx.createGain();
    v.gain.setValueAtTime(0.0001, t);
    v.gain.exponentialRampToValueAtTime(0.5, t + dur * 0.45);
    v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const am = this.ctx.createGain();
    am.gain.value = 0.8;
    lp.connect(am).connect(v).connect(out);
    this.osc("sawtooth", 96, t, dur, lp, { to: 78, curve: "lin" });
    this.osc("sawtooth", 144, t, dur, lp, { to: 116, curve: "lin", detune: 9 });
    const flutter = this.ctx.createOscillator();
    flutter.frequency.value = 23;
    const fg = this.ctx.createGain();
    fg.gain.value = 0.2;
    flutter.connect(fg).connect(am.gain);
    flutter.start(t);
    flutter.stop(t + dur);
  }

  s_shutter(o, t) {
    const out = this.out(o, t, { verb: 0.2, gain: 0.5 });
    for (const d of [0, 0.07]) this.hiss(t + d, out, { type: "bandpass", f: 3800, q: 3, peak: 0.7, d: 0.025 });
  }

  s_flare(o, t) {
    const out = this.out(o, t, { verb: 0.45, gain: 0.5 });
    this.thump(t, out, 240, 90, 0.08, 0.5);
    this.hiss(t + 0.05, out, { type: "bandpass", f: 2600, q: 0.8, a: 0.1, peak: 0.35, d: 1.6 });
  }

  s_fanfare(o, t) {
    const out = this.out(o, t, { verb: 0.55, gain: 0.9 });
    const seq = [[NOTE.C4, 0, 0.13], [NOTE.C4, 0.14, 0.13], [NOTE.C4, 0.28, 0.13], [NOTE.E4, 0.42, 0.42], [NOTE.C4, 0.86, 0.22], [NOTE.E4, 1.1, 0.22], [NOTE.G4, 1.34, 1.4]];
    for (const [f, at, d] of seq) this.brass(t + at, out, f, d, 0.2);
    for (const f of [NOTE.C4, NOTE.E4, NOTE.G4, NOTE.C5]) this.brass(t + 1.34, out, f / 2, 1.5, 0.08);
    for (let i = 0; i < 14; i++) this.hiss(t + 0.7 + i * 0.045, out, { type: "bandpass", f: 3200, q: 0.9, peak: 0.08 + i * 0.012, d: 0.06 });
    this.hiss(t + 1.34, out, { type: "highpass", f: 4500, peak: 0.45, d: 2.4 });
    this.thump(t + 1.34, out, 70, 40, 0.8, 0.8);
  }

  s_taps(o, t) {
    const out = this.out(o, t, { verb: 0.8, gain: 0.8 });
    const seq = [
      [NOTE.G3, 0, 0.5], [NOTE.G3, 0.55, 0.2], [NOTE.C4, 0.8, 1.5],
      [NOTE.G3, 2.5, 0.5], [NOTE.C4, 3.05, 0.2], [NOTE.E4, 3.3, 1.5],
      [NOTE.G3, 5.0, 0.35], [NOTE.C4, 5.4, 0.2], [NOTE.E4, 5.65, 0.5], [NOTE.G3, 6.2, 0.35], [NOTE.C4, 6.6, 0.2], [NOTE.E4, 6.85, 1.8],
    ];
    for (const [f, at, d] of seq) this.brass(t + at, out, f, d, 0.17);
  }

  s_horn(o, t) {
    const out = this.out(o, t, { verb: 0.7, gain: 0.8 });
    this.brass(t, out, NOTE.G3, 0.9, 0.16);
    this.brass(t + 0.95, out, NOTE.C4, 1.6, 0.16);
    this.brass(t + 0.95, out, NOTE.E3, 1.6, 0.1);
  }

  s_found(o, t) {
    const out = this.out(o, t, { verb: 0.5, gain: 0.8 });
    for (let i = 0; i < 12; i++) this.hiss(t + i * 0.04, out, { type: "bandpass", f: 3000, q: 1, peak: 0.1 + i * 0.02, d: 0.05 });
    this.hiss(t + 0.5, out, { type: "highpass", f: 5000, peak: 0.4, d: 1.8 });
    this.thump(t + 0.5, out, 80, 40, 0.6, 1);
    this.brass(t + 0.5, out, NOTE.G4, 0.5, 0.16);
    this.brass(t + 0.5, out, NOTE.C4, 0.5, 0.1);
  }

  s_taunt(o, t) {
    const id = o.id || 0;
    const out = this.out(o, t, { verb: 0.4, gain: 0.7 });
    if (id === 0) {
      this.brass(t, out, NOTE.G4, 0.15, 0.16);
      this.brass(t + 0.16, out, NOTE.C5, 0.45, 0.16);
    } else if (id === 1) {
      const v = this.vca(t, 0.02, 0.2, 0.7, out);
      const w = this.osc("sine", 1500, t, 0.75, v, { to: 2900, curve: "lin" });
      w.frequency.linearRampToValueAtTime(1300, t + 0.75);
    } else if (id === 2) {
      for (let i = 0; i < 3; i++) this.voice(t + i * 0.16, out, { f0: 210 - i * 10, f1: 190 - i * 10, dur: 0.11, formants: [800, 1250, 2800], peak: 0.35, breath: 0.7 });
    } else if (id === 3) {
      for (let i = 0; i < 10; i++) this.hiss(t + i * 0.04, out, { type: "bandpass", f: 3000, q: 1, peak: 0.12 + i * 0.02, d: 0.05 });
      this.hiss(t + 0.42, out, { type: "highpass", f: 5000, peak: 0.35, d: 1.4 });
    } else if (id === 4) {
      this.s_radio(o, t);
    } else {
      this.s_burst({ ...o, far: 0.6 }, t);
    }
  }

  // ---- ambience and the score -------------------------------------------------------------

  ambience() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.brown;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 420;
    bp.Q.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lg = ctx.createGain();
    lg.gain.value = 240;
    lfo.connect(lg).connect(bp.frequency);
    const g = ctx.createGain();
    g.gain.value = 0.22;
    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.09;
    const lg2 = ctx.createGain();
    lg2.gain.value = 0.1;
    lfo2.connect(lg2).connect(g.gain);
    this.windLevel = ctx.createGain();
    src.connect(bp).connect(g).connect(this.windLevel).connect(this.ambBus);
    src.start();
    lfo.start();
    lfo2.start();
    const air = ctx.createBufferSource();
    air.buffer = this.white;
    air.loop = true;
    this.staticGain = ctx.createGain();
    this.staticGain.gain.value = 0;
    air.connect(this.filter("bandpass", 2200, 0.5)).connect(this.staticGain).connect(this.ambBus);
    air.start();

    const drone = ctx.createGain();
    drone.gain.value = 0.045;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 240;
    const dl = ctx.createOscillator();
    dl.frequency.value = 0.05;
    const dg = ctx.createGain();
    dg.gain.value = 90;
    dl.connect(dg).connect(lp.frequency);
    dl.start();
    for (const [f, d] of [[55, -6], [55, 7], [82.41, 0], [110, 4]]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.detune.value = d;
      o.connect(lp);
      o.start();
    }
    lp.connect(drone).connect(this.musicBus);
    this.droneGain = drone;
  }

  snare(t, peak) {
    const out = this.out({ bus: this.musicBus }, t, { verb: 0.25, gain: 1 });
    this.hiss(t, out, { type: "bandpass", f: 3200, q: 0.8, peak, d: 0.11 });
    const v = this.vca(t, 0.001, peak * 0.6, 0.06, out);
    this.osc("triangle", 190, t, 0.07, v, { to: 150 });
  }

  timpani(t, f, peak) {
    const out = this.out({ bus: this.musicBus }, t, { verb: 0.45, gain: 1 });
    this.thump(t, out, f, f * 0.88, 1.3, peak);
    this.hiss(t, out, { f: 300, peak: peak * 0.4, d: 0.12 });
  }

  cricket(t) {
    const out = this.out({ bus: this.ambBus, pan: rnd(-0.9, 0.9) }, t, { verb: 0.3, gain: 0.05 });
    const f = rnd(4200, 4700);
    for (let i = 0; i < 3; i++) {
      const v = this.vca(t + i * 0.045, 0.002, 1, 0.02, out);
      this.osc("sine", f, t + i * 0.045, 0.03, v);
    }
  }

  crackle(t) {
    const out = this.out({ bus: this.ambBus, pan: rnd(-0.3, 0.3) }, t, { verb: 0.05, gain: 0.12 });
    this.hiss(t, out, { type: "bandpass", f: rnd(1800, 3400), q: 1.4, peak: rnd(0.3, 1), d: rnd(0.015, 0.05) });
  }

  blip(t) {
    const out = this.out({ bus: this.ambBus, pan: 0.2 }, t, { verb: 0.1, gain: 0.05 });
    const long = Math.random() < 0.4;
    const v = this.vca(t, 0.004, 1, long ? 0.18 : 0.06, out);
    this.osc("sine", 880, t, long ? 0.2 : 0.08, v);
  }

  // A march on a sixteenth-note grid, scheduled a little ahead of the audio clock.
  schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const bpm = this.moodName === "tension" ? 112 : 96;
    const sixteenth = 60 / bpm / 4;
    while (this.nextStep < ctx.currentTime + 0.12) {
      const t = this.nextStep;
      const s = this.step % 32;
      const m = this.moodName;
      if (m === "menu") {
        if (s === 0 && this.step % 64 === 0) this.timpani(t, 73.4, 0.5);
        if (s >= 24 && this.step % 64 >= 32) this.snare(t, 0.03 + (s - 24) * 0.012);
        const at = this.placeName;
        if (at === "war" || at === "signals") {
          if (Math.random() < 0.05) this.crackle(t);
        } else if (Math.random() < 0.04) this.cricket(t);
        if (at === "radio" && s % 8 === 0 && Math.random() < 0.35) this.blip(t);
      } else if (m === "battle" || m === "tension") {
        const pat = [1, 0, 0, 0.4, 0.7, 0, 0.5, 0, 1, 0, 0, 0.4, 0.8, 0.5, 0.6, 0.5];
        const g = pat[s % 16];
        if (g) this.snare(t, 0.045 * g + (m === "tension" ? 0.02 : 0));
        if (s % 16 === 0) this.timpani(t, 73.4, 0.4);
        if (m === "tension" && s % 4 === 0) {
          this.timpani(t, 49, 0.55);
          this.timpani(t + sixteenth * 0.9, 49, 0.35);
        }
        if (Math.random() < 0.02) this.cricket(t);
      } else if (m === "calm") {
        if (Math.random() < 0.05) this.cricket(t);
      }
      this.nextStep += sixteenth;
      this.step++;
    }
    const target = this.moodName === "silent" ? 0 : this.moodName === "calm" ? 0.03 : 0.045;
    this.droneGain.gain.setTargetAtTime(target, ctx.currentTime, 0.8);
  }
}
