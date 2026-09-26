import * as THREE from "three";

const TAU = Math.PI * 2;

function rect(path, x0, y0, x1, y1) {
  path.moveTo(x0, y0);
  path.lineTo(x1, y0);
  path.lineTo(x1, y1);
  path.lineTo(x0, y1);
  path.lineTo(x0, y0);
  return path;
}

// A skull for dead: eyes, nose and teeth cut through, so the block shows behind them.
export function skullShape() {
  const s = new THREE.Shape();
  s.moveTo(-0.17, -0.44);
  s.lineTo(0.17, -0.44);
  s.quadraticCurveTo(0.23, -0.44, 0.23, -0.38);
  s.lineTo(0.23, -0.28);
  s.quadraticCurveTo(0.24, -0.2, 0.31, -0.17);
  s.absarc(0, 0.06, 0.4, -0.6, Math.PI + 0.6, false);
  s.quadraticCurveTo(-0.24, -0.2, -0.23, -0.28);
  s.lineTo(-0.23, -0.38);
  s.quadraticCurveTo(-0.23, -0.44, -0.17, -0.44);
  for (const x of [-0.155, 0.155]) {
    const eye = new THREE.Path();
    eye.absellipse(x, 0.03, 0.105, 0.125, 0, TAU, false, x > 0 ? -0.35 : 0.35);
    s.holes.push(eye);
  }
  const nose = new THREE.Path();
  nose.moveTo(0, -0.07);
  nose.lineTo(0.058, -0.185);
  nose.lineTo(-0.058, -0.185);
  nose.lineTo(0, -0.07);
  s.holes.push(nose);
  for (const x of [-0.075, 0.075]) s.holes.push(rect(new THREE.Path(), x - 0.017, -0.405, x + 0.017, -0.3));
  return s;
}

// A bandage for injured, the one wounded soldiers wear: a strip with a pad and vent holes.
export function bandageShapes() {
  const L = 0.98;
  const r = 0.17;
  const strip = new THREE.Shape();
  strip.moveTo(-L / 2 + r, -r);
  strip.lineTo(L / 2 - r, -r);
  strip.absarc(L / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2, false);
  strip.lineTo(-L / 2 + r, r);
  strip.absarc(-L / 2 + r, 0, r, Math.PI / 2, Math.PI * 1.5, false);
  for (const x of [-0.37, -0.28, 0.28, 0.37]) {
    for (const y of [-0.055, 0.055]) {
      const h = new THREE.Path();
      h.absarc(x, y, 0.024, 0, TAU, true);
      strip.holes.push(h);
    }
  }
  const pad = new THREE.Shape();
  const w = 0.17;
  const h = 0.13;
  const c = 0.045;
  pad.moveTo(-w + c, -h);
  pad.lineTo(w - c, -h);
  pad.quadraticCurveTo(w, -h, w, -h + c);
  pad.lineTo(w, h - c);
  pad.quadraticCurveTo(w, h, w - c, h);
  pad.lineTo(-w + c, h);
  pad.quadraticCurveTo(-w, h, -w, h - c);
  pad.lineTo(-w, -h + c);
  pad.quadraticCurveTo(-w, -h, -w + c, -h);
  return { strip, pad };
}
