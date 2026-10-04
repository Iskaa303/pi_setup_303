/**
 * Pure logic for the decider extension: state on disk, the HTTP call, and
 * answer normalisation. Kept free of pi and typebox imports so it can be
 * unit-tested directly.
 */

import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const DEFAULT_URL = "http://127.0.0.1:8137";
const DEFAULT_PATH = "/v1/systemone";
const ASK_TOOLS = ["ask_user_question", "ask-user-question", "ask_user"];

export type QuestionType = "choice" | "noul" | "score";

export interface Question {
  type: QuestionType;
  instructions: string;
  /** choice: option -> description. noul: "true"/"false" descriptions. score: ordinal labels. */
  criteria?: Record<string, string> | string[];
}

export interface DecisionAnswer {
  type: QuestionType;
  choice?: string;
  noul?: number;
  score?: string | number;
  /** score answers come back as a level index plus this level -> description map */
  legend?: Record<string, string>;
  probabilities?: Record<string, number>;
  confidence?: number;
}

export interface State {
  enabled: boolean;
  /** set once the user has answered the permission question; never asked again */
  declined?: boolean;
  declinedAt?: number;
}

export function statePath(agentDir: string): string {
  return join(agentDir, "decider", "state.json");
}

export function readState(agentDir: string): State {
  try {
    return { enabled: false, ...JSON.parse(readFileSync(statePath(agentDir), "utf8")) };
  } catch {
    return { enabled: false };
  }
}

export function writeState(agentDir: string, state: State): void {
  const path = statePath(agentDir);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
}

/** A child subagent session cannot ask the user anything, so never gate on it. */
export function isChildSession(ctx: { sessionManager?: unknown }): boolean {
  const session = ctx.sessionManager as { getParentSessionId?: () => string | null } | undefined;
  return Boolean(session?.getParentSessionId?.());
}

export function findAskTool(ctx: { tools?: unknown }): string | undefined {
  const names = (ctx.tools ?? []) as string[];
  return ASK_TOOLS.find((candidate) => names.includes(candidate));
}

export interface HttpReply {
  status: number;
  body: unknown;
  error?: string;
}

/** POST to the decider service. Separate from the tool so it can be tested. */
export async function post(url: string, payload: unknown, timeoutMs = 120_000): Promise<HttpReply> {
  return await new Promise<HttpReply>((resolve) => {
    const child = spawn(
      "curl",
      ["-sS", "--max-time", String(Math.ceil(timeoutMs / 1000)), "-X", "POST", url, "-H", "Content-Type: application/json", "-d", JSON.stringify(payload)],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (chunk) => (out += String(chunk)));
    child.stderr.on("data", (chunk) => (err += String(chunk)));
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ status: 0, body: undefined, error: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      let body: unknown = out;
      try {
        body = JSON.parse(out);
      } catch {
        /* keep the raw text */
      }
      resolve({ status: code ?? 0, body, error: code === 0 ? undefined : err.trim() || `curl exited ${code}` });
    });
  });
}

/** Normalise whatever the service returned into an answer plus an escalate flag. */
export function normaliseAnswer(raw: Record<string, unknown>, threshold: number): { answer: DecisionAnswer; escalate: boolean } {
  const type = (raw.type as QuestionType) ?? "choice";
  const probabilities = (raw.probabilities ?? raw.probs ?? {}) as Record<string, number>;
  const ranked = Object.entries(probabilities).sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  // For a noul answer the returned probability *is* the confidence.
  const fallback = type === "noul" && typeof raw.noul === "number" ? (raw.noul as number) : top?.[1] ?? 0;
  const confidence = raw.confidence !== undefined ? (raw.confidence as number) : fallback;

  const answer: DecisionAnswer = { type, probabilities: Object.fromEntries(ranked), confidence };
  if (answer.type === "noul") answer.noul = raw.noul as number;
  else if (answer.type === "score") {
    // The service returns the level index; the legend carries the words.
    const level = (raw.score as number | string) ?? top?.[0];
    const legend = (raw.legend ?? undefined) as Record<string, string> | undefined;
    answer.score = level;
    if (legend) answer.legend = legend;
  } else answer.choice = (raw.choice as string) ?? top?.[0];

  return { answer, escalate: confidence < threshold };
}

/** The agent directory pi is using right now. */
export function currentAgentDir(): string {
  const explicit = process.env.PI_CODING_AGENT_DIR;
  if (explicit && explicit !== "~") return explicit;
  return join(process.env.HOME || homedir(), ".pi", "agent");
}

export { DEFAULT_PATH, DEFAULT_URL };
