// Run: node --experimental-strip-types --test test/decider.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { normaliseAnswer, unreachableText } from "../logic.ts";

test("an unreachable service names the endpoint and stops talking", () => {
  const text = unreachableText("http://127.0.0.1:8137/v1/systemone", "curl: (7) Failed to connect");
  assert.match(text, /http:\/\/127\.0\.0\.1:8137\/v1\/systemone/, "the model needs to know which URL was tried");
  assert.match(text, /ships no model/, "so it does not go looking for weights to install");
  assert.match(text, /decide without it/i);
  assert.doesNotMatch(text, /systemctl --user start decider/, "no unit is ours to start");
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

test("normaliseAnswer never renders a noul answer as ?", () => {
  const fromField = normaliseAnswer({ type: "noul", noul: 0.83 }, 0.8);
  assert.equal(fromField.answer.noul, 0.83);

  // A service that only sends probabilities still yields a value.
  const fromProbs = normaliseAnswer({ type: "noul", probabilities: { true: 0.7, false: 0.3 } }, 0.8);
  assert.equal(fromProbs.answer.noul, 0.7, "true is the answer, so 0.7 is the value");

  const neither = normaliseAnswer({ type: "noul", probabilities: { false: 0.9, true: 0.1 } }, 0.8);
  assert.equal(neither.answer.noul, 0.1, "noul is the probability of true, whatever it ranks");
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