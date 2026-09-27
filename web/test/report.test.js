import { test } from "node:test";
import assert from "node:assert/strict";
import { reportLines, telegramHtml } from "../src/client/report.js";

const s = { volleys: [
  { by: "me", guess: "1289", dead: 1, injured: 1 },
  { by: "opp", guess: "3670", dead: 2, injured: 0 },
  { by: "me", miss: true },
  { by: "me", guess: "1625", dead: 4, injured: 0 },
] };

test("a crack reports the verdict, the volleys fired and the dead on both sides", () => {
  assert.deepEqual(reportLines({ winner: "me", reason: "cracked" }, s, "General"), [
    "You cracked General's code",
    "2 volleys fired",
    "5 enemy soldiers down, 2 of yours lost",
  ]);
  assert.equal(reportLines({ winner: "opp", reason: "cracked" }, { volleys: [] }, "General")[0], "General cracked your code");
  assert.equal(reportLines({ winner: "opp", reason: "cracked" }, { volleys: [] }, "General")[1], "0 volleys fired");
});

test("time says who came closest, with each side's best volley", () => {
  const r = { winner: "draw", reason: "time", best: { me: { dead: 0, injured: 0 }, opp: { dead: 1, injured: 2 } } };
  const lines = reportLines(r, { volleys: [] }, "Recruit");
  assert.equal(lines[0], "Time. Neither side came closer");
  assert.equal(lines.at(-2), "Your best volley nothing hit");
  assert.equal(lines.at(-1), "Recruit's best 1 dead 2 injured");
});

test("forfeits and closed rooms", () => {
  assert.equal(reportLines({ winner: "me", reason: "left" }, s, "Bravo")[0], "Bravo left the field");
  assert.equal(reportLines({ winner: "opp", reason: "timeout" }, s, "Bravo")[0], "You misfired three times");
  assert.deepEqual(reportLines({ winner: "none", reason: "noshow" }, s, "Bravo"), ["Bravo never arrived"]);
  assert.deepEqual(reportLines({ winner: "none", reason: "cancelled" }, s, "Bravo"), ["The room is closed"]);
});

test("the telegram escapes names and carries both codes, except for a closed room", () => {
  const html = telegramHtml({ winner: "me", reason: "cracked", codes: { me: "3670", opp: "1625" } }, s, "<b>x</b>", { number: 1234 });
  assert.ok(!html.includes("<b>x</b>"));
  assert.ok(html.includes("&lt;b&gt;x&lt;/b&gt;"));
  assert.ok(html.includes("No. 1234"));
  assert.equal((html.match(/<i>/g) || []).length, 8);
  assert.ok(!telegramHtml({ winner: "none", reason: "noshow" }, s, "x", { number: 1 }).includes("tg-codes"));
});
