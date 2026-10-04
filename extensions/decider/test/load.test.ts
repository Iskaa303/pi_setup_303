// Load index.ts the way pi does, so a bad import or a top-level ReferenceError
// fails a test instead of only showing up as "X is not defined" mid-session.
//
// pi and typebox are host-provided, so they are stubbed through a resolver hook
// rather than installed: the point is to prove the module *links*, not to check
// schemas.
import { register } from "node:module";
import assert from "node:assert/strict";
import { test } from "node:test";

// Resolve the hook against this test's directory, not against the file itself.
register("./stubs.js", new URL(".", import.meta.url));

const extension = (await import("../index.ts")).default;

test("the extension module loads and registers its tool and command", () => {
  assert.equal(typeof extension, "function");

  const registered: string[] = [];
  const pi = {
    registerTool: (tool: { name?: string }) => registered.push(`tool:${tool?.name ?? "?"}`),
    registerCommand: (name: string) => registered.push(`command:${name}`),
    on: (event: string) => registered.push(`event:${event}`),
  };

  extension(pi as never);

  assert.deepEqual(registered, [
    "command:decider",
    "tool:system_one_decide",
    "event:session_start",
    "event:session_shutdown",
  ]);
});
