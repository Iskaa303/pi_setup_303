// Load index.ts the way pi does, so a bad import or a top-level ReferenceError
// fails a test instead of only showing up as "X is not defined" mid-session.
import { register } from "node:module";
import assert from "node:assert/strict";
import { test } from "node:test";

register("./stubs.js", new URL(".", import.meta.url));

const extension = (await import("../index.ts")).default;

test("the extension module loads and registers its tool and command", () => {
  assert.equal(typeof extension, "function");

  const registered: string[] = [];
  const pi = {
    registerTool: (tool: { name?: string }) => registered.push(`tool:${tool?.name ?? "?"}`),
    registerCommand: (name: string) => registered.push(`command:${name}`),
    on: () => {},
    events: { on: () => {} },
  };

  extension(pi as never);

  assert.deepEqual(registered, ["tool:notify_user", "command:attention-sound"]);
});
