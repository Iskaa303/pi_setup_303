/**
 * tui — drive and test terminal UI programs with agent-tui.
 *
 * pi already runs shell commands; this extension covers what bash cannot: a
 * program that expects a human at the keyboard. Every tool here shells out to
 * the `agent-tui` CLI (MIT, https://github.com/pproenca/agent-tui), which runs
 * the program in a virtual terminal so the screen can be read and keystrokes
 * sent. Follows the ketch-web-access idiom: spawn the binary, parse its JSON,
 * return model-readable text.
 *
 * Requires `agent-tui` on PATH (or AGENT_TUI_BIN set).
 */

import { spawn } from "node:child_process";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import {
  buildKillArgs,
  buildPressArgs,
  buildRunArgs,
  buildScreenshotArgs,
  buildSessionsArgs,
  buildTypeArgs,
  buildWaitArgs,
  formatScreen,
  formatSessions,
  parseSessionId,
  parseScreenshot,
  parseSessions,
  parseWait,
  type WaitOutcome,
} from "./logic.js";

// ---------------------------------------------------------------------------
// agent-tui CLI
// ---------------------------------------------------------------------------

interface CliRun {
  stdout: string;
  stderr: string;
  code: number;
}

function agentTuiBin(): string {
  return process.env.AGENT_TUI_BIN?.trim() || "agent-tui";
}

function runCli(
  args: string[],
  options: { cwd: string; stdin?: string; signal?: AbortSignal; timeoutMs?: number },
): Promise<CliRun> {
  return new Promise<CliRun>((resolve, reject) => {
    const child = spawn(agentTuiBin(), args, {
      cwd: options.cwd,
      // NO_INPUT keeps agent-tui from stopping for confirmation prompts a model
      // cannot answer; the extension passes every required flag explicitly.
      env: { ...process.env, AGENT_TUI_NO_INPUT: "1", NO_COLOR: "1", TERM: "dumb" },
      stdio: [options.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = options.timeoutMs ? setTimeout(() => child.kill("SIGKILL"), options.timeoutMs) : undefined;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      action();
    };
    const onAbort = () => child.kill("SIGTERM");
    options.signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", (chunk) => (stdout += String(chunk)));
    child.stderr.on("data", (chunk) => (stderr += String(chunk)));
    child.on("error", (error) => finish(() => reject(error)));
    child.on("close", (code) => finish(() => resolve({ stdout, stderr, code: code ?? -1 })));
    if (options.stdin !== undefined) child.stdin?.end(options.stdin);
  });
}

function failureText(run: CliRun): string {
  const detail = run.stderr.trim() || run.stdout.trim();
  return `agent-tui failed (exit ${run.code}).${detail ? `\n${detail}` : ""}`;
}

function errorResult(text: string, details: Record<string, unknown> = {}) {
  return { content: [{ type: "text" as const, text }], details: { error: text, ...details } };
}

// ---------------------------------------------------------------------------
// Shared screen read
//
// Every action that can change the UI is followed by "wait for the screen to
// settle, then read it": the agent-tui skill's reliability rule, done here so
// the model cannot act on a half-rendered screen by accident.
// ---------------------------------------------------------------------------

const SETTLE_TIMEOUT_MS = 8000;

async function settleAndRead(
  session: string | undefined,
  cwd: string,
  signal: AbortSignal | undefined,
  options: { waitFor?: string; timeoutMs?: number } = {},
): Promise<{ screen?: string; sessionId?: string; wait?: WaitOutcome }> {
  const timeoutMs = options.timeoutMs ?? SETTLE_TIMEOUT_MS;
  const waited = await runCli(
    buildWaitArgs({ stable: !options.waitFor, text: options.waitFor, timeoutMs, session }),
    { cwd, signal, timeoutMs: timeoutMs + 2000 },
  ).catch(() => undefined);
  const shot = await runCli(buildScreenshotArgs(session), { cwd, signal, timeoutMs: 15000 });
  if (shot.code !== 0) return { sessionId: session, wait: waited ? parseWait(waited.stdout) : undefined };
  const parsed = parseScreenshot(shot.stdout);
  return {
    screen: parsed.screenshot,
    sessionId: parsed.sessionId ?? session,
    wait: waited ? parseWait(waited.stdout) : undefined,
  };
}

/** Render an action's outcome and the screen it left behind. */
function actionResult(prefix: string, read: { screen?: string; sessionId?: string }): string {
  const head = read.sessionId ? `${prefix} (session ${read.sessionId})` : prefix;
  if (read.screen === undefined) return `${head}\n(could not read the screen; the program may have exited — tui_sessions shows its state)`;
  return `${head}\n${formatScreen(read.sessionId, read.screen)}`;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const RunParams = Type.Object({
  command: Type.String({ description: "Program to run, e.g. python3, htop, vim, git." }),
  args: Type.Optional(Type.Array(Type.String(), { description: "Arguments for the program (passed after `--`)." })),
  cwd: Type.Optional(Type.String({ description: "Working directory for the program." })),
  cols: Type.Optional(Type.Integer({ minimum: 20, maximum: 500, description: "Terminal columns (default 120)." })),
  rows: Type.Optional(Type.Integer({ minimum: 5, maximum: 200, description: "Terminal rows (default 40)." })),
  wait_for: Type.Optional(Type.String({ description: "Text to wait for once started, e.g. a prompt like '>>>'. Omit to wait for the screen to settle." })),
  timeout_ms: Type.Optional(Type.Integer({ minimum: 200, maximum: 120000, description: "How long to wait before reading the screen (default 8000)." })),
});
type RunArgs = Static<typeof RunParams>;

const SessionParam = Type.Optional(Type.String({ description: "agent-tui session id from tui_run. Omit to use the most recent session." }));

const ScreenshotParams = Type.Object({ session_id: SessionParam });

const TypeParams = Type.Object({
  text: Type.String({ description: "Literal text to type." }),
  enter: Type.Optional(Type.Boolean({ description: "Press Enter after typing (default false)." })),
  session_id: SessionParam,
});
type TypeArgs = Static<typeof TypeParams>;

const PressParams = Type.Object({
  keys: Type.Array(Type.String(), { description: "Key names, e.g. Enter, Escape, Tab, Ctrl+C, ArrowDown. Several are pressed in order." }),
  session_id: SessionParam,
});
type PressArgs = Static<typeof PressParams>;

const WaitParams = Type.Object({
  text: Type.Optional(Type.String({ description: "Wait until this text appears on screen." })),
  stable: Type.Optional(Type.Boolean({ description: "Wait for the screen to stop changing instead of a text match (default when text is omitted)." })),
  gone: Type.Optional(Type.Boolean({ description: "With text: wait for it to disappear instead." })),
  timeout_ms: Type.Optional(Type.Integer({ minimum: 100, maximum: 300000, description: "Timeout in milliseconds (default 30000)." })),
  session_id: SessionParam,
});
type WaitArgs = Static<typeof WaitParams>;

const KillParams = Type.Object({ session_id: SessionParam });

export default function tui(pi: ExtensionAPI): void {
  pi.registerTool(
    defineTool({
      name: "tui_run",
      label: "Run TUI app (agent-tui)",
      description:
        "Start a program that expects a human at the keyboard — a REPL, debugger, pager, editor, installer, or full-screen TUI — in a virtual terminal. Returns its session_id and the first settled screen. Use this instead of bash when the program would wait for input. Continue with tui_wait / tui_screenshot to observe and tui_type / tui_press to act, then tui_kill.",
      promptSnippet: "tui_run: start a REPL/debugger/TUI, then loop tui_wait → tui_press/tui_type → tui_screenshot; always tui_kill when done.",
      promptGuidelines: [
        "Never drive an interactive program with piped bash input when tui_run can hold the session open.",
        "Re-read the screen after every action; use tui_wait with `text` for a readiness signal instead of sleeping.",
        "End every session started with tui_run with tui_kill.",
      ],
      parameters: RunParams,
      async execute(_id, params: RunArgs, signal, _update, ctx) {
        const started = await runCli(
          buildRunArgs({ command: params.command, args: params.args, cwd: params.cwd, cols: params.cols, rows: params.rows }),
          { cwd: ctx.cwd, signal, timeoutMs: 30000 },
        );
        if (started.code !== 0) return errorResult(failureText(started));
        const sessionId = parseSessionId(started.stdout);
        if (!sessionId) return errorResult(`agent-tui run returned no session id.\n${started.stdout.trim()}`);

        const read = await settleAndRead(sessionId, ctx.cwd, signal, { waitFor: params.wait_for, timeoutMs: params.timeout_ms });
        const note = params.wait_for && read.wait && !read.wait.found ? `\n(text "${params.wait_for}" did not appear within ${read.wait.elapsedMs ?? 0}ms)` : "";
        return {
          content: [{ type: "text" as const, text: `Started ${params.command}${note}\n${actionResult("Screen", { ...read, sessionId })}` }],
          details: { sessionId, command: params.command, found: read.wait?.found },
        };
      },
    }),
  );

  pi.registerTool(
    defineTool({
      name: "tui_screenshot",
      label: "TUI screenshot (agent-tui)",
      description: "Read the current screen of a tui_run session as plain text. Use it to see what the program is showing right now.",
      promptSnippet: "tui_screenshot: read a TUI session's current screen as plain text.",
      parameters: ScreenshotParams,
      async execute(_id, params: Static<typeof ScreenshotParams>, signal, _update, ctx) {
        const shot = await runCli(buildScreenshotArgs(params.session_id), { cwd: ctx.cwd, signal, timeoutMs: 15000 });
        if (shot.code !== 0) return errorResult(failureText(shot));
        const parsed = parseScreenshot(shot.stdout);
        if (parsed.screenshot === undefined) return errorResult(`agent-tui screenshot returned no screen.\n${shot.stdout.trim()}`);
        return {
          content: [{ type: "text" as const, text: formatScreen(parsed.sessionId ?? params.session_id, parsed.screenshot) }],
          details: { sessionId: parsed.sessionId ?? params.session_id },
        };
      },
    }),
  );

  pi.registerTool(
    defineTool({
      name: "tui_type",
      label: "Type into TUI (agent-tui)",
      description: "Type literal text into a tui_run session (sent character by character, so it works in vim and REPLs). Set enter to submit it. Returns the screen after the program reacts.",
      promptSnippet: "tui_type: type literal text into a TUI session; set enter to submit.",
      parameters: TypeParams,
      async execute(_id, params: TypeArgs, signal, _update, ctx) {
        const typed = await runCli(buildTypeArgs(params.session_id), { cwd: ctx.cwd, stdin: params.text, signal, timeoutMs: 20000 });
        if (typed.code !== 0) return errorResult(failureText(typed));
        if (params.enter) {
          const pressed = await runCli(buildPressArgs(["Enter"], params.session_id), { cwd: ctx.cwd, signal, timeoutMs: 20000 });
          if (pressed.code !== 0) return errorResult(failureText(pressed));
        }
        const read = await settleAndRead(params.session_id, ctx.cwd, signal);
        return {
          content: [{ type: "text" as const, text: actionResult(`Typed ${JSON.stringify(params.text)}${params.enter ? " + Enter" : ""}`, read) }],
          details: { sessionId: read.sessionId, typed: params.text, enter: params.enter === true },
        };
      },
    }),
  );

  pi.registerTool(
    defineTool({
      name: "tui_press",
      label: "Press keys in TUI (agent-tui)",
      description: "Press named keys in a tui_run session: Enter, Escape, Tab, Backspace, ArrowUp/Down/Left/Right, PageUp/PageDown, Ctrl+C, F1–F10, or a letter. Several keys are pressed in order. Returns the screen afterwards.",
      promptSnippet: "tui_press: press named keys (Enter, Escape, Ctrl+C, arrows) in a TUI session.",
      parameters: PressParams,
      async execute(_id, params: PressArgs, signal, _update, ctx) {
        if (!params.keys.length) return errorResult("Error: no keys given.");
        const pressed = await runCli(buildPressArgs(params.keys, params.session_id), { cwd: ctx.cwd, signal, timeoutMs: 20000 });
        if (pressed.code !== 0) return errorResult(failureText(pressed));
        const read = await settleAndRead(params.session_id, ctx.cwd, signal);
        return {
          content: [{ type: "text" as const, text: actionResult(`Pressed ${params.keys.join(" ")}`, read) }],
          details: { sessionId: read.sessionId, keys: params.keys },
        };
      },
    }),
  );

  pi.registerTool(
    defineTool({
      name: "tui_wait",
      label: "Wait on TUI (agent-tui)",
      description: "Wait until text appears (or disappears with gone) on a tui_run session's screen, or until the screen stops changing with stable, then return the screen. Use it to synchronise with a program instead of sleeping.",
      promptSnippet: "tui_wait: wait for screen text (or stability) before acting; preferred over sleeping.",
      promptGuidelines: ["Prefer tui_wait with `text` — a semantic signal like '>>>' or '(Pdb)' beats waiting for silence."],
      parameters: WaitParams,
      async execute(_id, params: WaitArgs, signal, _update, ctx) {
        const wait = await runCli(
          buildWaitArgs({
            text: params.text,
            stable: params.stable || !params.text,
            gone: params.gone,
            timeoutMs: params.timeout_ms,
            session: params.session_id,
          }),
          { cwd: ctx.cwd, signal, timeoutMs: (params.timeout_ms ?? 30000) + 2000 },
        );
        const outcome = parseWait(wait.stdout);
        const shot = await runCli(buildScreenshotArgs(params.session_id), { cwd: ctx.cwd, signal, timeoutMs: 15000 });
        const parsed = parseScreenshot(shot.stdout);
        const status = outcome.found
          ? `Found${params.text ? ` "${params.text}"` : ""} after ${outcome.elapsedMs ?? 0}ms`
          : params.text
            ? `Did not find "${params.text}" within ${outcome.elapsedMs ?? params.timeout_ms ?? 30000}ms`
            : `Screen settled after ${outcome.elapsedMs ?? 0}ms`;
        const body = parsed.screenshot === undefined ? `${status}\n(could not read the screen)` : `${status}\n${formatScreen(parsed.sessionId ?? params.session_id, parsed.screenshot)}`;
        return {
          content: [{ type: "text" as const, text: body }],
          details: { found: outcome.found, elapsedMs: outcome.elapsedMs, sessionId: parsed.sessionId ?? params.session_id },
        };
      },
    }),
  );

  pi.registerTool(
    defineTool({
      name: "tui_kill",
      label: "Kill TUI session (agent-tui)",
      description: "End a tui_run session and its program. Call it when the interaction is done so no terminal session is left running.",
      promptSnippet: "tui_kill: end a tui session started with tui_run.",
      parameters: KillParams,
      async execute(_id, params: Static<typeof KillParams>, signal, _update, ctx) {
        const killed = await runCli(buildKillArgs(params.session_id), { cwd: ctx.cwd, signal, timeoutMs: 15000 });
        if (killed.code !== 0) return errorResult(failureText(killed));
        return {
          content: [{ type: "text" as const, text: `Killed session ${parseSessionId(killed.stdout) ?? params.session_id ?? "(current)"}.` }],
          details: { sessionId: parseSessionId(killed.stdout) ?? params.session_id },
        };
      },
    }),
  );

  pi.registerTool(
    defineTool({
      name: "tui_sessions",
      label: "List TUI sessions (agent-tui)",
      description: "List agent-tui sessions and mark the current one. Use it to recover a lost session_id or to check whether a program is still running.",
      promptSnippet: "tui_sessions: list live agent-tui sessions and the current one.",
      parameters: Type.Object({}),
      async execute(_id, _params, signal, _update, ctx) {
        const listed = await runCli(buildSessionsArgs(), { cwd: ctx.cwd, signal, timeoutMs: 15000 });
        if (listed.code !== 0) return errorResult(failureText(listed));
        const parsed = parseSessions(listed.stdout);
        return {
          content: [{ type: "text" as const, text: formatSessions(parsed.active, parsed.sessions) }],
          details: { active: parsed.active, sessions: parsed.sessions },
        };
      },
    }),
  );
}
