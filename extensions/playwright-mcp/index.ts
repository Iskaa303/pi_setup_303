/**
 * playwright-mcp — register Microsoft's Playwright MCP server with pi.
 *
 * Playwright MCP (Apache-2.0, https://github.com/microsoft/playwright-mcp) drives
 * a real browser through accessibility snapshots: navigate, click, type, read the
 * page, run JS, take screenshots. It complements ketch-web-access (fetch/search)
 * and REA (passive observation) by actually controlling a browser.
 *
 * The flake packages the server; this extension registers it for the session
 * instead of writing ~/.pi/agent/mcp.json, so a rebuild can never clobber that
 * file. The browser comes from the store, so we pass Chromium's path and disable
 * its sandbox (the store has no setuid helper).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** CLI args derived from pi's environment; exported for the unit test. */
export const browserArgs = (env: NodeJS.ProcessEnv): string[] => {
  const args: string[] = [];
  const executable = env.PLAYWRIGHT_CHROMIUM;
  if (executable) {
    args.push("--executable-path", executable);
    // Playwright's `--no-sandbox`; needed because the store has no setuid helper.
    args.push("--no-sandbox");
  }
  if (env.PLAYWRIGHT_HEADLESS === "true") args.push("--headless");
  return args;
};

export default function playwrightMcp(pi: ExtensionAPI): void {
  const command = process.env.PLAYWRIGHT_MCP_BIN;
  if (!command) return;

  pi.registerMcpServer("playwright", {
    command,
    args: browserArgs(process.env),
    description:
      "Browser automation with Playwright MCP: navigate, click, type and inspect live pages through accessibility snapshots.",
    exposure: "codemode",
    timeout: 120,
  });
}
