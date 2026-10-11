/**
 * rea-mcp — connect pi to REA's local MCP server.
 *
 * REA (Reverse Engineer Anything, MIT, https://github.com/morluto/rea) is a
 * CLI + MCP server for reverse engineering: native binaries (Ghidra/Hopper),
 * JavaScript/Electron, .NET, Android, firmware and websites. This flake
 * packages the `rea` CLI and its reverse-engineer-anything skill; the
 * extension registers the server for the session instead of writing
 * ~/.pi/agent/mcp.json, so a rebuild can never clobber that file.
 *
 * The command and every provider path come from pi's environment, which the
 * Home Manager module fills in from the store. REA rejects relative tool
 * configuration, so forwarding these verbatim is enough.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Provider/tool paths the module may set; forwarded to the server as-is. */
const FORWARDED_ENV = [
  "GHIDRA_INSTALL_DIR",
  "JAVA_HOME",
  "REA_BROWSER_EXECUTABLE",
  "REA_BROWSER_NO_SANDBOX",
  "REA_PWNTOOLS_PYTHON",
  "REA_MITMDUMP_COMMAND",
  "REA_BINWALK_COMMAND",
  "REA_UNBLOB_COMMAND",
  "REA_FIRMWARE_PRLIMIT_COMMAND",
  "REA_EVM_PRLIMIT_COMMAND",
  "REA_JAVASCRIPT_PRLIMIT_COMMAND",
];

export default function reaMcp(pi: ExtensionAPI): void {
  const command = process.env.REA_BIN;
  if (!command) return;

  const env: Record<string, string> = {};
  for (const key of FORWARDED_ENV) {
    const value = process.env[key];
    if (value) env[key] = value;
  }

  pi.registerMcpServer("rea", {
    command,
    args: ["mcp"],
    env,
    description:
      "Reverse engineering with REA: native binaries (Ghidra), JavaScript/Electron, .NET, Android, firmware and websites.",
    exposure: "codemode",
    // Ghidra import + auto-analysis can outlast the 60s default.
    timeout: 600,
  });
}
