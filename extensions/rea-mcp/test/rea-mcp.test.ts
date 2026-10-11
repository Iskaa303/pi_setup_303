import assert from "node:assert/strict";
import { test } from "node:test";
import reaMcp from "../index.ts";

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
    reaMcp(pi);
  } finally {
    process.env = saved;
  }
  return calls;
};

test("registers the rea stdio server when REA_BIN is set", () => {
  const calls = register({
    REA_BIN: "/nix/store/rea/bin/rea",
    GHIDRA_INSTALL_DIR: "/nix/store/ghidra/lib/ghidra",
    REA_BROWSER_EXECUTABLE: "/nix/store/chromium/bin/chromium",
    UNRELATED: "not forwarded",
  });

  assert.equal(calls.length, 1);
  const [name, config] = calls[0]!;
  assert.equal(name, "rea");
  assert.equal(config.command, "/nix/store/rea/bin/rea");
  assert.deepEqual(config.args, ["mcp"]);
  assert.deepEqual(config.env, {
    GHIDRA_INSTALL_DIR: "/nix/store/ghidra/lib/ghidra",
    REA_BROWSER_EXECUTABLE: "/nix/store/chromium/bin/chromium",
  });
});

test("does nothing without REA_BIN", () => {
  assert.deepEqual(register({ GHIDRA_INSTALL_DIR: "/nix/store/ghidra" }), []);
});
