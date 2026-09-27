// Paper, card and wood for the interface, painted once at load into blob URLs and handed to the
// stylesheet as custom properties, so every window is made of the same stuff as the world.
const rnd = (a, b) => a + Math.random() * (b - a);

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")];
}

function fibres(x, w, h, n, dark, light) {
  for (let i = 0; i < n; i++) {
    const px = Math.random() * w;
    const py = Math.random() * h;
    const len = rnd(3, 14);
    const a = Math.random() * Math.PI;
    x.strokeStyle = Math.random() < 0.5 ? dark : light;
    x.lineWidth = rnd(0.4, 1.1);
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len);
    x.stroke();
  }
}

function speckle(x, w, h, n, color) {
  x.fillStyle = color;
  for (let i = 0; i < n; i++) x.fillRect(Math.random() * w, Math.random() * h, rnd(0.6, 1.6), rnd(0.6, 1.6));
}

function blotches(x, w, h, n, color) {
  for (let i = 0; i < n; i++) {
    const r = rnd(20, 90);
    const px = Math.random() * w;
    const py = Math.random() * h;
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g;
    x.fillRect(px - r, py - r, r * 2, r * 2);
  }
}

const seeded = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

// The same strokes replayed at every neighbouring offset, so whatever runs off one edge comes
// back in at the other and the tile repeats without a seam.
function tile(w, h, base, draw) {
  const [c, x] = canvas(w, h);
  x.fillStyle = base;
  x.fillRect(0, 0, w, h);
  const seed = (Math.random() * 2 ** 32) >>> 0;
  const real = Math.random;
  try {
    for (const ox of [-w, 0, w]) {
      for (const oy of [-h, 0, h]) {
        Math.random = seeded(seed);
        x.save();
        x.translate(ox, oy);
        draw(x, w, h);
        x.restore();
      }
    }
  } finally {
    Math.random = real;
  }
  return c;
}

function paper(base) {
  return tile(256, 256, base, (x, w, h) => {
    blotches(x, w, h, 10, "rgba(120, 90, 40, 0.05)");
    blotches(x, w, h, 8, "rgba(255, 255, 240, 0.06)");
    fibres(x, w, h, 900, "rgba(90, 70, 40, 0.07)", "rgba(255, 255, 245, 0.12)");
    speckle(x, w, h, 500, "rgba(60, 45, 25, 0.12)");
  });
}

function wood(base, grain, { plank = 0, knots = 3 } = {}) {
  return tile(256, 256, base, (x, w, h) => {
    for (let y = 0; y < h; y += rnd(2, 5)) {
      x.strokeStyle = grain.replace("A", rnd(0.05, 0.22).toFixed(2));
      x.lineWidth = rnd(0.6, 2);
      x.beginPath();
      const f = (Math.PI * 2 * Math.ceil(rnd(0.01, 3))) / w;
      const amp = rnd(0.5, 2.5);
      for (let px = 0; px <= w; px += 8) x.lineTo(px, y + Math.sin(px * f + y) * amp);
      x.stroke();
    }
    for (let k = 0; k < knots; k++) {
      const px = Math.random() * w;
      const py = Math.random() * h;
      for (let r = 9; r > 0; r -= 2.2) {
        x.strokeStyle = grain.replace("A", "0.25");
        x.lineWidth = 1;
        x.beginPath();
        x.ellipse(px, py, r * 2.4, r, 0, 0, Math.PI * 2);
        x.stroke();
      }
    }
    if (plank) {
      for (let y = 0; y < h; y += plank) {
        x.fillStyle = "rgba(0,0,0,0.35)";
        x.fillRect(0, y, w, 1.5);
        x.fillStyle = "rgba(255,230,190,0.08)";
        x.fillRect(0, y + 1.5, w, 1);
      }
    }
    speckle(x, w, h, 300, "rgba(0, 0, 0, 0.18)");
  });
}

// The same canvases, for the 3D plank under the icons.
export const canvases = {};

const url = (c) => new Promise((ok) => c.toBlob((b) => ok(b ? URL.createObjectURL(b) : c.toDataURL()), "image/png"));

export async function paintTextures() {
  const set = {
    paper: paper("#ebe1c9"),
    manila: paper("#d8be8b"),
    pad: paper("#efe8d6"),
    plank: wood("#4b3a28", "rgba(20, 12, 6, A)", { plank: 0, knots: 2 }),
    board: wood("#3b2c1f", "rgba(12, 8, 4, A)", { plank: 64, knots: 4 }),
  };
  Object.assign(canvases, set);
  const root = document.documentElement.style;
  await Promise.all(Object.entries(set).map(async ([k, c]) => root.setProperty(`--tex-${k}`, `url(${await url(c)})`)));
}
