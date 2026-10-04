// Run: node --experimental-strip-types --test test/decider.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { findAskTool, normaliseAnswer, readGrant, SessionStore } from "../logic.ts";

test("a session starts off and nothing has been decided yet", () => {
  const store = new SessionStore();
  assert.deepEqual(store.get("s1"), { enabled: false });
  assert.equal(store.size, 0, "reading must not create an entry");
});

test("state is per session, so one answer never leaks into another", () => {
  const store = new SessionStore();
  store.set("s1", { enabled: false, declined: true, declinedAt: 1 });
  assert.equal(store.get("s1").declined, true);
  assert.equal(store.get("s2").declined, undefined, "a new session is asked afresh");
  assert.equal(store.get("s2").enabled, false);

  store.set("s2", { enabled: true });
  assert.equal(store.get("s1").enabled, false, "enabling one session does not enable another");
});

test("updates merge rather than replace", () => {
  const store = new SessionStore();
  store.set("s1", { enabled: false, declined: true, declinedAt: 7 });
  const next = store.set("s1", { enabled: true });
  assert.equal(next.enabled, true);
  assert.equal(next.declined, true, "the record of the refusal is kept until reset");
  assert.equal(next.declinedAt, 7);
});

test("dropping a session forgets its decision", () => {
  const store = new SessionStore();
  store.set("s1", { enabled: true });
  store.set("s2", { enabled: true });
  assert.equal(store.size, 2);
  store.drop("s1");
  assert.equal(store.size, 1);
  assert.deepEqual(store.get("s1"), { enabled: false });
});

test("findAskTool accepts both string and object tool lists", () => {
  assert.equal(findAskTool({ tools: ["read", "ask_user_question"] }), "ask_user_question");
  assert.equal(findAskTool({ tools: [{ name: "read" }, { name: "ask_user_question" }] }), "ask_user_question");
  assert.equal(findAskTool({ tools: [] }), undefined);
  assert.equal(findAskTool({}), undefined);
});

test("readGrant only reports an actual answer, never a guess", () => {
  assert.equal(readGrant({ details: { answers: { decider: "Turn it on" } } }), true);
  assert.equal(readGrant({ details: { answers: { decider: "Keep it off" } } }), false);
  assert.equal(readGrant({ details: { answers: {} } }), undefined, "an empty answer is not consent");
  assert.equal(readGrant({ details: {} }), undefined);
  assert.equal(readGrant(undefined), undefined);
});

test("normaliseAnswer ranks options and flags low confidence for escalation", () => {
  const high = normaliseAnswer({ type: "choice", probabilities: { web: 0.2, code: 0.8 } }, 0.7);
  assert.equal(high.answer.choice, "code");
  assert.equal(high.escalate, false);
  assert.deepEqual(Object.keys(high.answer.probabilities ?? {}), ["code", "web"]);

  const low = normaliseAnswer({ type: "choice", probabilities: { web: 0.55, code: 0.45 } }, 0.8);
  assert.equal(low.escalate, true, "below threshold must escalate");
});

test("normaliseAnswer handles noul and score answers", () => {
  const noul = normaliseAnswer({ type: "noul", noul: 0.83 }, 0.8);
  assert.equal(noul.answer.noul, 0.83);
  assert.equal(noul.escalate, false, "a noul answer's probability is its confidence");

  const score = normaliseAnswer({ type: "score", probabilities: { low: 0.1, high: 0.9 } }, 0.8);
  assert.equal(score.answer.score, "high");
});

test("normaliseAnswer keeps the score legend so levels can be rendered", () => {
  const score = normaliseAnswer(
    {
      type: "score",
      score: 2,
      confidence: 0.9,
      probabilities: { "0": 0.05, "1": 0.05, "2": 0.9 },
      legend: { "0": "Low", "1": "Medium", "2": "Critical" },
    },
    0.8,
  );
  assert.equal(score.answer.score, 2);
  assert.equal(score.answer.legend?.["2"], "Critical");
});
