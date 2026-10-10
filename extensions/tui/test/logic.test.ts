// Run: node --experimental-strip-types --test test/*.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  baseArgs,
  buildKillArgs,
  buildPressArgs,
  buildRunArgs,
  buildScreenshotArgs,
  buildTypeArgs,
  buildWaitArgs,
  formatScreen,
  formatSessions,
  parseSessionId,
  parseScreenshot,
  parseSessions,
  parseWait,
} from "../logic.ts";

test("run puts the command before `--` and its arguments after", () => {
  const args = buildRunArgs({ command: "python3", args: ["-i"], cwd: "/tmp", cols: 80, rows: 24 });
  assert.deepEqual(args, ["--json", "run", "--cols", "80", "--rows", "24", "--cwd", "/tmp", "python3", "--", "-i"]);
  assert.deepEqual(buildRunArgs({ command: "htop" }), ["--json", "run", "--cols", "120", "--rows", "40", "htop"]);
});

test("a session id pins every command with a global --session", () => {
  assert.deepEqual(baseArgs(), ["--json"]);
  assert.deepEqual(baseArgs("abc123"), ["--json", "--session", "abc123"]);
  assert.deepEqual(buildScreenshotArgs("abc123").slice(-2), ["screenshot", "--strip-ansi"]);
  assert.deepEqual(buildTypeArgs("abc123"), ["--json", "--session", "abc123", "type", "-"]);
  assert.deepEqual(buildPressArgs(["Ctrl+C"], "abc123"), ["--json", "--session", "abc123", "press", "Ctrl+C"]);
  assert.deepEqual(buildKillArgs("abc123"), ["--json", "--session", "abc123", "kill", "--yes"]);
});

test("wait chooses a condition and carries the timeout", () => {
  assert.deepEqual(buildWaitArgs({ stable: true, timeoutMs: 500 }), ["--json", "wait", "--stable", "--timeout", "500"]);
  assert.deepEqual(buildWaitArgs({ text: ">>>", session: "s1" }), ["--json", "--session", "s1", "wait", ">>>", "--timeout", "30000"]);
  assert.deepEqual(buildWaitArgs({ text: "Loading", gone: true }), ["--json", "wait", "Loading", "--gone", "--timeout", "30000"]);
});

test("report parsers read the CLI's JSON shapes", () => {
  assert.equal(parseSessionId('{"pid":1,"session_id":"76ff5c9a"}'), "76ff5c9a");
  assert.equal(parseSessionId("not json"), undefined);

  const shot = parseScreenshot('{"screenshot":"a\\r\\nb\\r\\n","session_id":"s1"}');
  assert.equal(shot.screenshot, "a\nb", "CRLF is normalised and trailing whitespace dropped");
  assert.equal(shot.sessionId, "s1");

  const found = parseWait('{"elapsed_ms":12,"found":true}');
  assert.equal(found.found, true);
  assert.equal(found.elapsedMs, 12);

  // The timeout shape nests the result under `context`.
  const missed = parseWait('{"category":"timeout","code":75,"context":{"elapsed_ms":400,"found":false}}');
  assert.equal(missed.found, false);
  assert.equal(missed.elapsedMs, 400);
});

test("sessions list is summarised with its current marker", () => {
  const parsed = parseSessions(
    '{"active_session":"b","sessions":[{"id":"a","command":"htop","running":true,"size":{"cols":80,"rows":24}},{"id":"b","command":"python3","running":false}]}',
  );
  assert.equal(parsed.active, "b");
  assert.equal(parsed.sessions.length, 2);
  assert.equal(parsed.sessions[0].cols, 80);
  assert.match(formatSessions(parsed.active, parsed.sessions), /\* b {2}exited {2}python3/);
  assert.match(formatSessions(undefined, []), /No agent-tui sessions/);
});

test("a screen is labelled with its session", () => {
  assert.equal(formatScreen("s1", "hello\n"), "[session s1]\nhello");
  assert.match(formatScreen(undefined, ""), /screen is blank/);
});