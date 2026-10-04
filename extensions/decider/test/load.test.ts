// Load index.ts the way pi does, so a bad import or a top-level ReferenceError
// fails a test instead of only showing up as "X is not defined" mid-session.
//
// pi and typebox are host-provided, so they are stubbed through a resolver hook
// rather than installed: the point is to prove the module *links*, not to check
// schemas.
import { register } from "node:module";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";

// Resolve the hook against this test's directory, not against the file itself.
register("./stubs.js", new URL(".", import.meta.url));

const extension = (await import("../index.ts")).default;

test("the extension registers only its tool: no command, no session state", () => {
  assert.equal(typeof extension, "function");

  const registered: string[] = [];
  const pi = {
    registerTool: (tool: { name?: string }) => registered.push(`tool:${tool?.name ?? "?"}`),
    registerCommand: (name: string) => registered.push(`command:${name}`),
    on: (event: string) => registered.push(`event:${event}`),
  };

  extension(pi as never);

  assert.deepEqual(registered, ["tool:system_one_decide"]);
});

test("the tool answers from a live service and reports an honest miss when there is none", async () => {
  // A stand-in for the real service: enough of POST /v1/systemone to prove the
  // client, the rendering and the down path all work without a model present.
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += String(chunk)));
    req.on("end", () => {
      const { questions } = JSON.parse(body) as {
        questions: Record<string, { type: string; criteria?: Record<string, string> | string[] }>;
      };
      const answers: Record<string, unknown> = {};
      for (const [name, question] of Object.entries(questions)) {
        const keys =
          question.type === "score"
            ? (question.criteria as string[]).map((_, i) => String(i))
            : question.type === "noul"
              ? ["true", "false"]
              : Object.keys(question.criteria ?? {});
        answers[name] = {
          type: question.type,
          choice: keys[0],
          probabilities: Object.fromEntries(keys.map((key, i) => [key, i === 0 ? 0.83 : 0.17])),
        };
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ answers }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };

  let tool: { execute: (id: string, args: unknown) => Promise<{ content: { text: string }[] }> } | undefined;
  extension({ registerTool: (t: typeof tool) => (tool = t) } as never);

  process.env.DECIDER_URL = `http://127.0.0.1:${port}`;
  const up = await tool!.execute("1", {
    state: "the diff needs a web fetch",
    questions: [
      { name: "route", type: "choice", instructions: "which tool", criteria: { web: "needs the network", code: "touches the repo" } },
      { name: "urgent", type: "noul", instructions: "is this urgent" },
    ],
  });
  assert.match(up.content[0].text, /route: web \(83%\)/);
  assert.match(up.content[0].text, /urgent: 0\.83/, "a noul answer shows its probability, not ?");
  assert.doesNotMatch(up.content[0].text, /No decider service/);

  // Nothing listening: one line, the URL, and no repair instructions.
  process.env.DECIDER_URL = "http://127.0.0.1:9";
  const down = await tool!.execute("2", { state: "x", questions: [] });
  assert.match(down.content[0].text, /No decider service at http:\/\/127\.0\.0\.1:9\/v1\/systemone/);
  assert.match(down.content[0].text, /ships no model/);
  assert.equal(down.content[0].text.split("\n").length, 1, "one line, then get out of the way");

  delete process.env.DECIDER_URL;
  server.close();
});
