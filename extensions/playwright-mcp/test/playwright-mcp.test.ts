import assert from "node:assert/strict";
import { test } from "node:test";
import playwrightMcp, { browserArgs } from "../index.ts";

/** Run the extension against a stub pi and a clean env snapshot. */
const register = (env: Record<string, string | undefined>) => {
  const saved = { ...process.env };
  for (const key of Object.keys(process.env)) delete process.env[key];
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) process.env[key] = value;
  }
  const calls: Array<[string, Record<string, unknown>]> = [];
  const pi = {
    registerMcpServer: (name: string, config: Record<string, unknown>) => {
      calls.push([name, config]);
    },
  } as never;
  try {
    playwrightMcp(pi);
  } finally {
    process.env = saved;
  }
  return calls;
};

test("uses nixpkgs Chromium with the sandbox disabled", () => {
  assert.deepEqual(
    browserArgs({
      PLAYWRIGHT_CHROMIUM: "/nix/store/chromium/bin/chromium",
      PLAYWRIGHT_HEADLESS: "true",
    }),
    ["--executable-path", "/nix/store/chromium/bin/chromium", "--no-sandbox", "--headless"],
  );
});

test("omits the executable when the host supplies its own browser", () => {
  assert.deepEqual(browserArgs({ PLAYWRIGHT_HEADLESS: "false" }), []);
});

test("registers the playwright server when PLAYWRIGHT_MCP_BIN is set", () => {
  const calls = register({
    PLAYWRIGHT_MCP_BIN: "/nix/store/pw/bin/playwright-mcp",
    PLAYWRIGHT_CHROMIUM: "/nix/store/chromium/bin/chromium",
    PLAYWRIGHT_HEADLESS: "true",
  });

  assert.equal(calls.length, 1);
  const [name, config] = calls[0]!;
  assert.equal(name, "playwright");
  assert.equal(config.command, "/nix/store/pw/bin/playwright-mcp");
  assert.deepEqual(config.args, [
    "--executable-path",
    "/nix/store/chromium/bin/chromium",
    "--no-sandbox",
    "--headless",
  ]);
});

test("does nothing without PLAYWRIGHT_MCP_BIN", () => {
  assert.deepEqual(register({ PLAYWRIGHT_CHROMIUM: "/nix/store/chromium/bin/chromium" }), []);
});
