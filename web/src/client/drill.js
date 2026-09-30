// Training: a scripted drill against a squad whose code is fixed, so every volley lands as a
// lesson. The sergeant's slip reads the match as it stands and says what just happened, shows
// what is known of their code, and asks for the next move, which the keypad and the supplies
// are locked to.
export const DRILL_CODE = "5019";

const LESSONS = ["Fire", "Injured", "Dead", "Missed", "Recon", "Smoke", "Marking", "Sniper", "Crack it"];
const tiles = (s, cls = "") => `<span class="tiles${cls ? ` ${cls}` : ""}">${[...s].map((c) => `<i>${c}</i>`).join("")}</span>`;
const pill = (cls, text) => `<span class="pill ${cls}">${text}</span>`;
const want = (s) => tiles(s, "want");
const struck = (s, cls) => `<span class="tiles">${[...s].map((c, i) => `<i class="${cls[i] || ""}">${c}</i>`).join("")}</span>`;

function result(v) {
  if (!v) return "";
  if (v.hits != null) return `${tiles(v.guess)} ${pill("n", `${v.hits} hits`)}`;
  if (!v.dead && !v.injured) return `${tiles(v.guess)} ${pill("n", "nothing hit")}`;
  const parts = [];
  if (v.dead) parts.push(pill("d", `${v.dead} dead`));
  if (v.injured) parts.push(pill("i", `${v.injured} injured`));
  return `${tiles(v.guess)} ${parts.join(" ")}`;
}

// The lesson for a match state and the marks on the keypad. `want` is the one move the drill
// takes next: a guess typed in order, a supply with its picks, marks on the keypad, or a free
// guess from the digits given.
export function lesson(s, marks) {
  const mine = s.volleys.filter((v) => v.by === "me");
  const n = mine.length;
  const used = new Set(s.powers.map((p) => p.kind));
  const theirs = new Set((s.oppPowers || []).map((p) => p.kind));
  const last = mine[n - 1];
  const unknown = { slots: ["?", "?", "?", "?"] };
  const step = (lessonNo, o) => ({ lesson: lessonNo, of: LESSONS.length, name: LESSONS[lessonNo], legend: null, tray: null, said: "", auto: null, ...o });

  if (n === 0) return step(0, { said: "The drill squad hides four different digits and never fires back.", tray: unknown, text: `Fire ${want("1234")}.`, want: { guess: "1234" } });
  if (n === 1) return step(1, { said: result(last), legend: "injured", tray: unknown, text: `One of them is in their code, in another spot. Fire ${want("5678")}.`, want: { guess: "5678" } });
  if (n === 2) return step(2, { said: result(last), legend: "dead", tray: unknown, text: `One of them is in their code, in the same spot. Fire ${want("6782")}.`, want: { guess: "6782" } });
  if (!used.has("recon")) {
    return step(3, {
      said: `${result(last)}<span class="drill-line">${struck("5678", ["dead", "out", "out", "out"])} so the dead one was 5: spot 1.</span>`, legend: "miss", auto: { out: ["6", "7", "8", "2"] },
      tray: { slots: ["5", "?", "?", "?"] }, text: `Recon asks if one digit is in their code. Send the plane for ${want("9")}.`, want: { power: "recon", digit: "9" },
    });
  }
  if (!theirs.has("smoke")) return step(4, { said: `<span class="flare"></span>Green flare: 9 is in their code.`, tray: { slots: ["5", "?", "?", "?"], pool: ["9"] }, text: "Stand by.", want: { wait: true } });
  if (!used.has("smoke")) return step(5, { said: "They popped smoke. Your next volley only counts hits.", tray: { slots: ["5", "?", "?", "?"], pool: ["9"] }, text: "You have smoke too. Pop it.", want: { power: "smoke" } });
  if (n === 3) return step(5, { said: "Smoke up. In a real match, their next volley would only see hits.", tray: { slots: ["5", "?", "?", "?"], pool: ["9"] }, text: `Fire ${want("5901")} into the smoke.`, want: { guess: "5901" } });
  const marked = ["5", "0", "1"].filter((d) => marks.get(d) === "in");
  if (n === 4 && marked.length < 3) {
    return step(6, {
      said: `${result(last)}<span class="drill-line">All four are in their code. The smoke hid the spots.</span>`, tray: { slots: ["5", "?", "?", "?"], pool: ["9"] },
      text: `Mark them in: tap the pencil, then ${want("501")} twice each (${struck("5", ["out"])} then ${struck("5", ["in"])}).`, want: { marks: ["5", "0", "1"] },
    });
  }
  if (!used.has("sniper")) {
    return step(7, {
      said: "All four marked.", tray: { slots: ["5", "?", "?", "?"], pool: ["9", "0", "1"] }, auto: { pencil: false },
      text: `The sniper checks one digit in one spot. Pick ${want("0")} and the soldier in spot 2.`, want: { power: "sniper", digit: "0", pos: 1 },
    });
  }
  if (n === 4) return step(8, { said: "Hit: 0 is in spot 2.", tray: { slots: ["5", "0", "?", "?"], pool: ["9", "1"] }, text: `Fire ${want("5091")}.`, want: { guess: "5091" } });
  if (n === 5) {
    return step(8, {
      said: `${result(last)}<span class="drill-line">5 and 0 are right. 9 and 1 are in, but swapped.</span>`, tray: { slots: ["5", "0", "9", "1"], swap: true },
      text: "Crack it: fire their code.", want: { free: ["5", "0", "1", "9"] },
    });
  }
  return step(8, { said: `${result(last)}<span class="drill-line">Not yet.</span>`, tray: { slots: ["5", "0", "9", "1"], swap: true }, text: `Swap them: fire ${want("5019")}.`, want: { guess: "5019" } });
}
