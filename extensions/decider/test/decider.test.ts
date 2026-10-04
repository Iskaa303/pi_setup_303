// Run: node --experimental-strip-types --test test/decider.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { findAskTool, normaliseAnswer, readGrant, requestPermission, SessionStore } from "../logic.ts";

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

test("readGrant ignores the question it just sent (pi records nestedCalls)", () => {
  // pi keeps a record of nested tool calls — name and arguments — in details.
  // Those arguments contain the option labels, so stringifying the whole reply
  // made the tool deny permission using its own prompt.
  const reply = {
    details: {
      nestedCalls: [
        {
          name: "ask_user_question",
          arguments: {
            questions: [{ options: [{ label: "Keep it off" }, { label: "Turn it on" }] }],
          },
        },
      ],
    },
  };
  assert.equal(readGrant(reply), undefined, "no answers means no answer, not a refusal");
});

test("requestPermission asks, and only records a real answer", async () => {
  const store = new SessionStore();
  const asked: string[] = [];
  const callTool = async (name: string) => {
    asked.push(name);
    return { details: { answers: { decider: "Turn it on" } } };
  };

  const grant = await requestPermission({ tools: ["ask_user_question"], store, sessionId: "s1", callTool });
  assert.deepEqual(asked, ["ask_user_question"], "it must actually call the ask tool");
  assert.equal(grant, true);
  assert.equal(store.get("s1").enabled, true);
});

test("requestPermission records a refusal only when the user picks one", async () => {
  const store = new SessionStore();
  const grant = await requestPermission({
    tools: ["ask_user_question"],
    store,
    sessionId: "s1",
    callTool: async () => ({ details: { answers: { decider: "Keep it off" } } }),
  });
  assert.equal(grant, false);
  assert.equal(store.get("s1").declined, true);
  assert.equal(store.get("s2").declined, undefined, "another session is unaffected");
});

test("requestPermission refuses to invent a refusal it never received", async () => {
  const store = new SessionStore();

  const noTool = await requestPermission({ tools: ["read"], store, sessionId: "s1", callTool: async () => ({}) });
  assert.equal(noTool, undefined);
  assert.equal(store.get("s1").declined, undefined, "no tool is not a refusal");
  assert.equal(store.size, 0, "and nothing is written");

  const threw = await requestPermission({
    tools: ["ask_user_question"],
    store,
    sessionId: "s1",
    callTool: async () => {
      throw new Error("no_ui");
    },
  });
  assert.equal(threw, undefined);
  assert.equal(store.get("s1").declined, undefined);

  const noAnswers = await requestPermission({
    tools: ["ask_user_question"],
    store,
    sessionId: "s1",
    callTool: async () => ({ details: { nestedCalls: [{ name: "ask_user_question", arguments: { questions: [{ options: [{ label: "Keep it off" }] }] } }] } }),
  });
  assert.equal(noAnswers, undefined);
  assert.equal(store.get("s1").declined, undefined, "its own prompt is not an answer");
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
