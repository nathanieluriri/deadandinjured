import { POWERS } from "../shared/rules.js";

// Training: the lessons are read off the match as it stands, so they follow whatever the player
// does. Fire, read the result, then each supply with a volley between (one crate a turn), then
// crack the code.
const STEPS = ["Fire", "Dead and injured", "Recon", "Sniper", "Smoke", "Crack it"];
const SPOT = ["first", "second", "third", "fourth"];
const spaced = (g) => g.split("").join(" ");

const NEXT = { recon: "spotter plane", sniper: "rifle scope", smoke: "smoke canister" };
const TEACH = {
  recon: "Supplies cost a crate each, and you have one for every supply. Tap the <b>spotter plane</b> on the plank, pick a digit and send the plane: a green flare means that digit is in their code, a red one means it is not.",
  sniper: "Tap the <b>rifle scope</b>. Pick a digit and one of their soldiers (tap him on the field, or his spot number). A hit proves that digit sits in his spot.",
  smoke: "Smoke is for defence. Tap the <b>smoke canister</b> and pop smoke: the enemy's next volley only learns how many digits it hit, not how many dead and injured. The drill squad never fires, but in a real match pop it when they are close to cracking yours.",
};

function volleySaid(v) {
  const g = spaced(v.guess);
  if (!v.dead && !v.injured) return `<b>Nothing hit.</b> None of ${g} is in their code: rule them all out.`;
  const dead = v.dead ? `<b class="d">${v.dead} dead</b>: ${v.dead === 1 ? "one of your digits is" : `${v.dead} of your digits are`} in the right place.` : "";
  const more = v.dead ? (v.injured === 1 ? "one more is" : `${v.injured} more are`) : v.injured === 1 ? "one of your digits is" : `${v.injured} of your digits are`;
  const hurt = v.injured ? `<b class="i">${v.injured} injured</b>: ${more} in their code, but in the wrong place.` : "";
  return `Your volley ${g}. ${[dead, hurt].filter(Boolean).join(" ")}`;
}

function powerSaid(p) {
  if (p.kind === "recon") return `<b>Recon:</b> ${p.args.digit} ${p.result ? "is in their code" : "is not in their code"}. It is marked on your keypad.`;
  if (p.kind === "sniper") return p.result
    ? `<b>Sniper:</b> a hit. ${p.args.digit} is their ${SPOT[p.args.pos]} digit.`
    : `<b>Sniper:</b> a miss. ${p.args.digit} is not their ${SPOT[p.args.pos]} digit, though it may sit somewhere else.`;
  return "<b>Smoke up.</b> Your squad is hidden until the enemy's next volley.";
}

// The lesson for a match state: its number, its name, what just happened and what to do next.
export function lesson(s) {
  const mine = s.volleys.filter((v) => v.by === "me");
  const used = new Set(s.powers.map((p) => p.kind));
  const last = s.powers.at(-1);
  const said = last && last.at === s.volleys.length ? powerSaid(last) : mine.length ? volleySaid(mine.at(-1)) : "";
  const next = POWERS.find((k) => !used.has(k));
  let step;
  let text;
  if (!mine.length) {
    step = 0;
    text = "The drill squad has hidden a code of four different digits, and they will not fire back. Tap the <b>field gun</b> on the plank, aim four different digits, then <b>Fire</b>.";
  } else if (mine.length === 1 && !used.size) {
    step = 1;
    text = "<b class=\"d\">Dead</b> is a right digit in the right place, <b class=\"i\">injured</b> a right digit in the wrong place. You learn how many, never which. Swap some digits and fire again to narrow it down.";
  } else if (next) {
    step = 2 + POWERS.indexOf(next);
    text = s.me.powerUsed ? `One crate goes out a turn: fire a volley, then try the ${NEXT[next]}.` : TEACH[next];
  } else {
    step = 5;
    const best = Math.max(0, ...mine.map((v) => (v.dead || 0) + (v.injured || 0)));
    text = best === 4
      ? `Now crack it: four dead. You have found all four digits${mine.at(-1).dead + mine.at(-1).injured === 4 ? " in your last volley" : ""}, so only their order is left.`
      : "Now crack it: four dead. Open the <b>notebook</b> to compare your volleys, and long press a key to mark a digit in or out.";
  }
  return { step, of: STEPS.length, name: STEPS[step], said, text };
}
