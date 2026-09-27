export const SIDES = {
  me: { z: 6, dir: 1, face: Math.PI, clay: 0xe8e0d2, flag: 0xefe8dc },
  opp: { z: -18, dir: -1, face: 0, clay: 0xc4492f, flag: 0xb8391f },
};

export const COLORS = {
  ink: 0x17171b,
  metal: 0x2a2a2e,
  wood: 0x6b4a2e,
  sky: { top: 0x0c1024, mid: 0x3d2138, horizon: 0xe07a48, sun: 0xffd6a4 },
  fog: 0x74402f,
};

const hash = (x, z) => {
  const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return h - Math.floor(h);
};

function noise(x, z) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi);
  const b = hash(xi + 1, zi);
  const c = hash(xi, zi + 1);
  const d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, z, oct = 4) {
  let s = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += a * noise(x * f, z * f);
    f *= 2.03;
    a *= 0.5;
  }
  return s;
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// The field: flat ground where the squads stand, a trench behind each line, rolling
// no man's land between them and hills that climb on both flanks.
export function groundHeight(x, z) {
  const ax = Math.abs(x);
  let h = (fbm(x * 0.07 + 3.1, z * 0.07 - 1.7) - 0.5) * 1.3;
  h += smooth(10, 36, ax) * (4 + fbm(x * 0.035 + 9, z * 0.035) * 14);
  h += smooth(16, 44, z) * 5 * fbm(x * 0.05, z * 0.05 + 4);
  h += smooth(-28, -70, z) * (3 + 9 * fbm(x * 0.04 + 2, z * 0.04));
  for (const s of [SIDES.me, SIDES.opp]) {
    const dz = z - s.z;
    const pad = (1 - smooth(7.5, 10.5, ax)) * (1 - smooth(3.2, 6, Math.abs(dz)));
    h *= 1 - pad;
    const tz = s.z + s.dir * 2.5;
    const trench = (1 - smooth(0.5, 1.15, Math.abs(z - tz))) * (1 - smooth(7.5, 8.6, ax));
    h -= trench * 1.25;
  }
  return h;
}

export const smoothstep = smooth;
