// Run: node --experimental-strip-types --test test/decider.test.ts
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { existsSync as _exists } from "node:fs";
import { normaliseAnswer, readState, statePath, writeState } from "../logic.ts";

const dirs: string[] = [];
const agentDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "decider-test-"));
  dirs.push(dir);
  return dir;
};
after(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

test("state defaults to disabled and nothing is asked twice", () => {
  const dir = agentDir();
  assert.deepEqual(readState(dir), { enabled: false });

  writeState(dir, { enabled: false, declined: true, declinedAt: 123 });
  const reread = readState(dir);
  assert.equal(reread.declined, true);
  assert.equal(reread.enabled, false, "a refusal must not also enable the model");
});

test("state file lives under the agent dir and is readable", () => {
  const dir = agentDir();
  writeState(dir, { enabled: true });
  const path = statePath(dir);
  assert.ok(_exists(path));
  assert.equal(JSON.parse(readFileSync(path, "utf8")).enabled, true);
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
  assert.equal(noul.escalate, false);

  const score = normaliseAnswer({ type: "score", probabilities: { low: 0.1, high: 0.9 } }, 0.8);
  assert.equal(score.answer.score, "high");
});

test("normaliseAnswer keeps the score legend so levels can be rendered", () => {
  const score = normaliseAnswer(
    { type: "score", score: 2, confidence: 0.9, probabilities: { "0": 0.05, "1": 0.05, "2": 0.9 }, legend: { "0": "Low", "1": "Medium", "2": "Critical" } },
    0.8,
  );
  assert.equal(score.answer.score, 2);
  assert.equal(score.answer.legend?.["2"], "Critical");
});
