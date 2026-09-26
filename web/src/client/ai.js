import { allCodes, score, randomCode } from "../shared/rules.js";

export const LEVELS = {
  recruit: { name: "Recruit", note: "Fires half blind" },
  sergeant: { name: "Sergeant", note: "Never wastes a shot" },
  general: { name: "General", note: "Reads every volley" },
};

const fits = (code, v) => {
  if (v.miss) return true;
  const r = score(v.guess, code);
  return v.hits != null ? r.dead + r.injured === v.hits : r.dead === v.dead && r.injured === v.injured;
};

function entropy(guess, cands, counts) {
  counts.fill(0);
  for (let i = 0; i < cands.length; i++) {
    const r = score(guess, cands[i]);
    counts[r.dead * 5 + r.injured]++;
  }
  let h = 0;
  for (let k = 0; k < 25; k++) {
    if (!counts[k]) continue;
    const p = counts[k] / cands.length;
    h -= p * Math.log2(p);
  }
  return h;
}

// The computer's side of a match: it keeps every code still possible and narrows it with each
// volley and each supply it spends.
export class Commander {
  constructor(level = "sergeant", rng = Math.random) {
    this.level = LEVELS[level] ? level : "sergeant";
    this.rng = rng;
    this.cands = allCodes().slice();
    this.history = [];
    this.fired = new Set();
  }

  learn(v) {
    if (v.miss) return;
    this.history.push(v);
    this.cands = this.cands.filter((c) => fits(c, v));
  }

  learnPower({ kind, args, result }) {
    if (kind === "recon") this.cands = this.cands.filter((c) => c.includes(args.digit) === result);
    if (kind === "sniper") this.cands = this.cands.filter((c) => (c[args.pos] === args.digit) === result);
  }

  pick(list) {
    return list[Math.floor(this.rng() * list.length)];
  }

  // Which supply to spend this turn, if any. `threat` is the best dead count the player has scored.
  choosePower(supplies, threat, turn) {
    if (supplies < 1 || this.cands.length <= 1) return null;
    if (this.level === "recruit") return turn >= 3 && this.rng() < 0.25 ? { kind: "smoke" } : null;
    if (threat >= 3 || (threat >= 2 && this.level === "general" && this.rng() < 0.5)) return { kind: "smoke" };
    if (this.level === "sergeant" && (turn < 2 || this.rng() < 0.55)) return null;
    if (this.cands.length > 12) {
      let best = null;
      let bestGap = Infinity;
      for (const d of "0123456789") {
        const n = this.cands.reduce((a, c) => a + (c.includes(d) ? 1 : 0), 0);
        const gap = Math.abs(n - this.cands.length / 2);
        if (gap < bestGap) { bestGap = gap; best = d; }
      }
      return { kind: "recon", digit: best };
    }
    if (this.level === "general" && this.cands.length > 2) {
      let best = null;
      let bestGap = Infinity;
      for (let pos = 0; pos < 4; pos++) {
        for (const d of "0123456789") {
          const n = this.cands.reduce((a, c) => a + (c[pos] === d ? 1 : 0), 0);
          if (!n || n === this.cands.length) continue;
          const gap = Math.abs(n - this.cands.length / 2);
          if (gap < bestGap) { bestGap = gap; best = { kind: "sniper", digit: d, pos }; }
        }
      }
      return best;
    }
    return null;
  }

  guess() {
    const g = this.choose();
    this.fired.add(g);
    return g;
  }

  choose() {
    const fresh = (list) => list.filter((c) => !this.fired.has(c));
    if (this.level === "recruit") {
      if (!this.history.length || (this.history.length < 5 && this.rng() < 0.45)) {
        let g;
        do g = randomCode(this.rng); while (this.fired.has(g));
        return g;
      }
      const last = this.history.length - 1;
      const kept = this.history.filter((v, i) => i === last || this.rng() > 0.5);
      const loose = fresh(allCodes().filter((c) => kept.every((v) => fits(c, v))));
      return loose.length ? this.pick(loose) : this.pick(fresh(this.cands).length ? fresh(this.cands) : this.cands);
    }
    const cands = fresh(this.cands);
    const live = cands.length ? cands : this.cands;
    if (this.level === "sergeant" && this.history.length > 1 && this.rng() < 0.5) {
      const last = this.history.length - 1;
      const kept = this.history.filter((v, i) => i >= last - 1 || this.rng() > 0.6);
      const loose = fresh(allCodes().filter((c) => kept.every((v) => fits(c, v))));
      if (loose.length) return this.pick(loose);
    }
    if (this.level === "sergeant" || live.length <= 2) return this.pick(live);
    if (!this.history.length) return this.pick(["0123", "4567", "1234", "5678", "2345"]);
    const pool = live.length <= 350 ? live.slice() : Array.from({ length: 300 }, () => this.pick(live));
    if (live.length > 3) for (let i = 0; i < 60; i++) pool.push(randomCode(this.rng));
    const counts = new Int32Array(25);
    const inSet = new Set(live);
    let best = pool[0];
    let bestH = -1;
    for (const g of pool) {
      if (this.fired.has(g)) continue;
      const h = entropy(g, live, counts) + (inSet.has(g) ? 0.05 : 0);
      if (h > bestH) { bestH = h; best = g; }
    }
    return best;
  }
}
