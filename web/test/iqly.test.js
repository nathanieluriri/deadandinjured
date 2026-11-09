import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanCode,
  eventsForMatch,
  postbackBody,
  report,
  IQLY_STEPS,
} from "../src/worker/iqly.js";

test("only an iQLY run code is kept", () => {
  assert.equal(cleanCode("iq-7k3p2"), "IQ-7K3P2");
  assert.equal(cleanCode("IQ-AAAAA"), "IQ-AAAAA");
  assert.equal(cleanCode("not-a-code"), "");
  assert.equal(cleanCode("https://evil.example/?ref=IQ-AAAAA"), "");
});

test("a win against anyone earns play then win; a multi win also earns play-with", () => {
  assert.deepEqual(eventsForMatch({ kind: "solo", result: "win" }), [
    "create-website-account",
    "play-a-match-or-round",
    "win-a-match-or-round",
  ]);
  assert.deepEqual(eventsForMatch({ kind: "solo", result: "loss" }), [
    "create-website-account",
    "play-a-match-or-round",
  ]);
  assert.deepEqual(eventsForMatch({ kind: "multi", result: "win" }), [
    "create-website-account",
    "play-a-match-or-round",
    "win-a-match-or-round",
    "play-with-another-person",
  ]);
  assert.deepEqual(eventsForMatch({ kind: "multi", result: "loss" }), [
    "create-website-account",
    "play-a-match-or-round",
    "play-with-another-person",
  ]);
});

test("the signed body is compact JSON in field order", () => {
  assert.equal(
    postbackBody({
      code: "IQ-7K3P2",
      step: 0,
      event: "create-website-account",
      txnId: "order-1",
      ts: 1735689600,
    }),
    '{"code":"IQ-7K3P2","step":0,"event":"create-website-account","txn_id":"order-1","ts":1735689600}',
  );
});

function mockEnv({ sent = new Set(), posts = [] } = {}) {
  return {
    IQLY_SECRET: "iqs_test_secret",
    IQLY_KEY: "iqk_test_key",
    IQLY_POSTBACK_URL: "https://example.test/v1/postbacks",
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async first() {
                if (sql.includes("SELECT iqly_code")) return { iqly_code: "IQ-7K3P2" };
                if (sql.includes("SELECT event")) {
                  return sent.has(args[1]) ? { event: args[1] } : null;
                }
                return null;
              },
              async run() {
                if (sql.includes("INSERT OR IGNORE INTO iqly_events")) sent.add(args[1]);
                return { meta: { changes: 1 } };
              },
            };
          },
        };
      },
    },
    posts,
  };
}

test("a loss does not send play-with until a win has already gone out", async () => {
  const posts = [];
  const sent = new Set();
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    posts.push(JSON.parse(init.body));
    return new Response("{}", { status: 200 });
  };
  try {
    const env = mockEnv({ sent, posts });
    await report(env, {
      playerId: "p1",
      earned: eventsForMatch({ kind: "multi", result: "loss" }),
      txnStem: "dai-p1-m1",
      code: "IQ-7K3P2",
    });
    assert.deepEqual(posts.map((p) => p.event), [
      "create-website-account",
      "play-a-match-or-round",
    ]);
    await report(env, {
      playerId: "p1",
      earned: eventsForMatch({ kind: "solo", result: "win" }),
      txnStem: "dai-p1-m2",
      code: "IQ-7K3P2",
    });
    assert.deepEqual(posts.map((p) => p.event), [
      "create-website-account",
      "play-a-match-or-round",
      "win-a-match-or-round",
    ]);
    await report(env, {
      playerId: "p1",
      earned: eventsForMatch({ kind: "multi", result: "loss" }),
      txnStem: "dai-p1-m3",
      code: "IQ-7K3P2",
    });
    assert.deepEqual(posts.map((p) => p.event), [
      "create-website-account",
      "play-a-match-or-round",
      "win-a-match-or-round",
      "play-with-another-person",
    ]);
    assert.equal(posts[0].step, 0);
    assert.equal(posts[2].step, 2);
    assert.ok(IQLY_STEPS.length === 4);
  } finally {
    globalThis.fetch = original;
  }
});
