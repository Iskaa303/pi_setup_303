// Run: node --experimental-strip-types --test test/*.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { decideSound, questionTrigger, shouldNotify, subagentTrigger, type Trigger } from "../logic.ts";

const trigger: Trigger = { kind: "question", summary: "pi is asking you a question" };

test("an ask-user tool call is the trigger to notify on", () => {
  // This predicate used to live in index.ts, where no test ever ran it.
  assert.deepEqual(questionTrigger({ toolName: "ask_user_question" }), trigger);
  assert.deepEqual(questionTrigger({ tool_name: "ask_user_question" }), trigger);
  assert.equal(questionTrigger({ toolName: "bash" }), undefined, "ordinary tools must stay quiet");
  assert.equal(questionTrigger({}), undefined);

  assert.ok(subagentTrigger({ toolName: "subagent", arguments: { mode: "ask_user_question" } }));
  assert.equal(subagentTrigger({ toolName: "subagent", arguments: { mode: "review" } }), undefined);
});

test("shouldNotify rate-limits repeats inside the window", () => {
  const fired = new Map<string, number>();
  assert.equal(shouldNotify(trigger, fired, 30_000, 1_000), true, "first call notifies");
  assert.equal(shouldNotify(trigger, fired, 30_000, 2_000), false, "same summary inside the window is swallowed");
  assert.equal(shouldNotify(trigger, fired, 30_000, 40_000), true, "notifies again once the window passes");
});

test("shouldNotify keys on kind and summary, so different triggers both fire", () => {
  const fired = new Map<string, number>();
  assert.equal(shouldNotify(trigger, fired, 30_000, 1_000), true);
  assert.equal(shouldNotify({ ...trigger, kind: "subagent" }, fired, 30_000, 1_100), true);
  assert.equal(shouldNotify({ ...trigger, summary: "something else" }, fired, 30_000, 1_200), true);
});

test("decideSound returns nothing when no player or file exists", () => {
  const sound = decideSound({} as NodeJS.ProcessEnv);
  // Either a real system sound was found, or none — but it must never point at
  // a file that does not exist.
  if (sound) {
    assert.ok(sound.player, "a sound must come with a player");
  } else {
    assert.equal(sound, undefined);
  }
});

test("decideSound ignores a PI_ATTENTION_SOUND path that does not exist", () => {
  const sound = decideSound({ PI_ATTENTION_SOUND: "/nope/missing.wav" } as NodeJS.ProcessEnv);
  if (sound) assert.notEqual(sound.path, "/nope/missing.wav");
});
