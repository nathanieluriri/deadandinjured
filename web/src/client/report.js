// The after-action report as a telegram: short typed lines, each one ended with STOP.
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const best = (b) => (b && b.dead + b.injured ? `${b.dead} dead ${b.injured} injured` : "nothing hit");

export function reportLines(r, s, opp) {
  const lines = [];
  if (r.winner === "none") {
    lines.push(r.reason === "noshow" ? `${opp} never arrived` : "The room is closed");
    return lines;
  }
  const verdict = {
    me: { cracked: `You cracked ${opp}'s code`, left: `${opp} left the field`, timeout: `${opp} misfired three times`, time: "Time. You came closest to cracking it" },
    opp: { cracked: `${opp} cracked your code`, left: "You left the field", timeout: "You misfired three times", time: `Time. ${opp} came closest to cracking it` },
    draw: { cracked: "Both codes fell in the same round", time: "Time. Neither side came closer" },
  }[r.winner]?.[r.reason] || "The war is over";
  lines.push(verdict);
  const volleys = s?.volleys || [];
  const fired = volleys.filter((v) => v.by === "me" && !v.miss).length;
  const kills = volleys.filter((v) => v.by === "me").reduce((a, v) => a + (v.dead || 0), 0);
  const lost = volleys.filter((v) => v.by === "opp").reduce((a, v) => a + (v.dead || 0), 0);
  lines.push(`${plural(fired, "volley")} fired`);
  lines.push(`${plural(kills, "enemy soldier")} down, ${lost} of yours lost`);
  if (r.reason === "time" && r.best) {
    lines.push(`Your best volley ${best(r.best.me)}`);
    lines.push(`${opp}'s best ${best(r.best.opp)}`);
  }
  return lines;
}

export function telegramHtml(r, s, opp, { number }) {
  const lines = reportLines(r, s, opp).map((l) => `<p><span class="tg-strip">${esc(l)} stop</span></p>`).join("");
  const tiles = (code) => `<span class="tiles">${(code || "????").split("").map((c) => `<i>${esc(c)}</i>`).join("")}</span>`;
  const codes = r.winner === "none" ? "" : `<div class="tg-codes"><span class="tg-code">Your code${tiles(r.codes?.me)}</span><span class="tg-code opp">${esc(opp)}'s code${tiles(r.codes?.opp)}</span></div>`;
  return `<p class="tg-head"><span>Field telegraph</span><em>No. ${number}</em></p><div class="tg-lines">${lines}</div>${codes}`;
}
