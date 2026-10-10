/**
 * Pure argument builders and output parsers for the `agent-tui` CLI.
 *
 * Kept apart from index.ts so the CLI contract is testable without spawning a
 * terminal:
 *
 *   node --experimental-strip-types --test test/*.test.ts
 *
 * The CLI contract these mirror is documented by `agent-tui <cmd> --help`; the
 * shapes below were read from `--format json` output of agent-tui 1.1.0.
 */

export interface RunOptions {
  command: string;
  args?: string[];
  cwd?: string;
  cols?: number;
  rows?: number;
}

export interface WaitOptions {
  text?: string;
  stable?: boolean;
  gone?: boolean;
  timeoutMs?: number;
  session?: string;
}

export interface TuiSession {
  id: string;
  command?: string;
  running?: boolean;
  pid?: number;
  cols?: number;
  rows?: number;
}

export interface WaitOutcome {
  found: boolean;
  elapsedMs?: number;
  message?: string;
}

/**
 * Global flags, always first: `--json` is what makes the reply parseable, and
 * `--session` pins every command to one session instead of "the most recent".
 */
export function baseArgs(session?: string): string[] {
  return session ? ["--json", "--session", session] : ["--json"];
}

export function buildRunArgs(options: RunOptions): string[] {
  const args = [
    ...baseArgs(),
    "run",
    "--cols",
    String(options.cols ?? 120),
    "--rows",
    String(options.rows ?? 40),
  ];
  if (options.cwd) args.push("--cwd", options.cwd);
  args.push(options.command);
  // `--` keeps arguments that start with a dash from being read as run flags.
  if (options.args?.length) args.push("--", ...options.args);
  return args;
}

export function buildScreenshotArgs(session?: string): string[] {
  // --strip-ansi is what makes the screenshot plain text the model can read.
  return [...baseArgs(session), "screenshot", "--strip-ansi"];
}

export function buildTypeArgs(session?: string): string[] {
  // `type -` reads the payload from stdin, so arbitrary text never needs
  // quoting or escaping on the command line.
  return [...baseArgs(session), "type", "-"];
}

export function buildPressArgs(keys: string[], session?: string): string[] {
  return [...baseArgs(session), "press", ...keys];
}

export function buildWaitArgs(options: WaitOptions): string[] {
  const args = [...baseArgs(options.session), "wait"];
  if (options.stable) args.push("--stable");
  else if (options.text) args.push(options.text);
  if (options.gone) args.push("--gone");
  args.push("--timeout", String(options.timeoutMs ?? 30000));
  return args;
}

export function buildKillArgs(session?: string): string[] {
  return [...baseArgs(session), "kill", "--yes"];
}

export function buildSessionsArgs(): string[] {
  return [...baseArgs(), "sessions", "list"];
}

export function parseJson(raw: string): unknown {
  const text = raw.trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function parseSessionId(raw: string): string | undefined {
  const value = parseJson(raw) as { session_id?: unknown } | undefined;
  return typeof value?.session_id === "string" ? value.session_id : undefined;
}

export function parseScreenshot(raw: string): { screenshot?: string; sessionId?: string } {
  const value = parseJson(raw) as { screenshot?: unknown; session_id?: unknown } | undefined;
  const screenshot = typeof value?.screenshot === "string" ? value.screenshot.replace(/\r\n?/g, "\n").trimEnd() : undefined;
  return {
    screenshot,
    sessionId: typeof value?.session_id === "string" ? value.session_id : undefined,
  };
}

/**
 * `wait` answers `{found, elapsed_ms}` on success and an error object with a
 * `context` on timeout. Both are read here so callers never have to branch on
 * the exit code.
 */
export function parseWait(raw: string): WaitOutcome {
  const value = parseJson(raw) as Record<string, unknown> | undefined;
  if (!value) return { found: false };
  const context = (value.context ?? {}) as Record<string, unknown>;
  const elapsed = typeof value.elapsed_ms === "number" ? value.elapsed_ms : context.elapsed_ms;
  return {
    found: value.found === true || context.found === true,
    elapsedMs: typeof elapsed === "number" ? elapsed : undefined,
    message: typeof value.message === "string" ? value.message : undefined,
  };
}

export function parseSessions(raw: string): { active?: string; sessions: TuiSession[] } {
  const value = parseJson(raw) as { active_session?: unknown; sessions?: unknown } | undefined;
  const sessions = Array.isArray(value?.sessions) ? value.sessions : [];
  return {
    active: typeof value?.active_session === "string" ? value.active_session : undefined,
    sessions: sessions
      .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
      .map((entry) => {
        const size = (entry.size ?? {}) as Record<string, unknown>;
        return {
          id: String(entry.id ?? ""),
          command: typeof entry.command === "string" ? entry.command : undefined,
          running: typeof entry.running === "boolean" ? entry.running : undefined,
          pid: typeof entry.pid === "number" ? entry.pid : undefined,
          cols: typeof size.cols === "number" ? size.cols : undefined,
          rows: typeof size.rows === "number" ? size.rows : undefined,
        };
      }),
  };
}

export function formatSessions(active: string | undefined, sessions: TuiSession[]): string {
  if (!sessions.length) return "No agent-tui sessions are running.";
  return sessions
    .map((session) => {
      const mark = session.id === active ? "*" : " ";
      const state = session.running === false ? "exited" : "running";
      return `${mark} ${session.id}  ${state}  ${session.command ?? "?"}`;
    })
    .join("\n");
}

/** A stable, readable block: what the screen shows, and which session it is. */
export function formatScreen(sessionId: string | undefined, screen: string): string {
  const label = sessionId ? `session ${sessionId}` : "current session";
  return `[${label}]\n${screen.trimEnd() || "(screen is blank)"}`;
}
