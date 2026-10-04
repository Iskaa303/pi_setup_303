/**
 * Pure logic for the decider extension: per-session state, the HTTP call, and
 * answer normalisation. Kept free of pi and typebox imports so it can be
 * unit-tested directly.
 */

import { spawn } from "node:child_process";

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
  /** set once the user has answered the permission question; not asked again */
  declined?: boolean;
  declinedAt?: number;
}

/**
 * On/off is a session decision, not a global preference: whether to spend
 * battery on a 4B model belongs to the conversation you are in right now.
 * So the state lives in this process, keyed by session id, and is dropped when
 * the session ends. A refusal is remembered for the rest of that session and
 * forgotten by the next one — nothing is written to ~/.pi.
 */
export class SessionStore {
  private readonly states = new Map<string, State>();

  get(sessionId: string): State {
    return { enabled: false, ...this.states.get(sessionId) };
  }

  set(sessionId: string, patch: State): State {
    const next = { ...this.get(sessionId), ...patch };
    this.states.set(sessionId, next);
    return next;
  }

  drop(sessionId: string): void {
    this.states.delete(sessionId);
  }

  get size(): number {
    return this.states.size;
  }
}

/** A child subagent session cannot ask the user anything, so never gate on it. */
export function isChildSession(ctx: { sessionManager?: unknown }): boolean {
  const session = ctx.sessionManager as { getParentSessionId?: () => string | null } | undefined;
  return Boolean(session?.getParentSessionId?.());
}

export function findAskTool(ctx: { tools?: unknown }): string | undefined {
  // ctx.tools is not guaranteed to be a list of plain strings — accept either
  // "name" or { name } entries, because guessing wrong here means the user is
  // never asked anything.
  const entries = (ctx.tools ?? []) as Array<string | { name?: string }>;
  const names = entries.map((entry) => (typeof entry === "string" ? entry : (entry?.name ?? "")));
  return ASK_TOOLS.find((candidate) => names.includes(candidate));
}

export const PERMISSION_QUESTION = {
  header: "decider",
  question: "The local decision model (decider-4b, 4B params) is off. Load it when you need routing or escalate-or-not decisions?",
  options: [
    { label: "Keep it off", description: "No model load, no extra battery. /decider on later if you change your mind." },
    { label: "Turn it on", description: "Loads ~8GB of weights on first use and answers these calls." },
  ],
};

/**
 * What to tell the model when it needs the user's permission.
 *
 * The question is always asked by the *model*, never from inside this tool: a
 * nested `ctx.executeTool("ask_user_question", …)` returns without rendering a
 * question (rpiv's own handler bails on `ctx.hasUI`), so calling it here only
 * cost a dead turn and produced a misleading "I cannot ask you" message.
 */
export function permissionPrompt(tools: unknown): string {
  const askTool = findAskTool({ tools });
  if (askTool) {
    return `Ask the user with ${askTool}: question "${PERMISSION_QUESTION.question}", options "Turn it on" / "Keep it off". Then call system_one_decide again with permission: true or false. Do not retry without asking.`;
  }
  return `Ask the user directly: "${PERMISSION_QUESTION.question}" — offer "Turn it on" / "Keep it off". Then call system_one_decide again with permission: true or false. Do not retry without asking.`;
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


export { DEFAULT_PATH, DEFAULT_URL };
