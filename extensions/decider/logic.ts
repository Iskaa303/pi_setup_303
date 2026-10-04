/**
 * Pure logic for the decider extension: the HTTP call, answer normalisation,
 * and what to say when nothing answers. Kept free of pi and typebox imports so
 * it can be unit-tested directly.
 *
 * There is deliberately no state here. The extension is a client for whatever
 * answers POST /v1/systemone; if that URL answers, the tool works, and if it
 * does not, the tool says so and gets out of the way. No gate, no weights, no
 * on/off — those belonged to a model this repo does not ship.
 */

import { spawn } from "node:child_process";

const DEFAULT_URL = "http://127.0.0.1:8137";
const DEFAULT_PATH = "/v1/systemone";

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

/**
 * What to tell the model when the URL does not answer. Name the endpoint and
 * stop: the service is somebody else's to start, and this extension ships no
 * model, so there is nothing here to retry or repair.
 */
export function unreachableText(url: string, detail: string): string {
  return `No decider service at ${url} (${detail}). This extension is only an HTTP client and ships no model: start the service, point DECIDER_URL at another one, or decide without it.`;
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
  if (answer.type === "noul") {
    // A noul answer's value *is* a probability. Prefer the field the service
    // sent; otherwise read it off the true/false distribution, so the tool
    // never renders "?" while holding the answer in its hands.
    answer.noul = typeof raw.noul === "number" ? raw.noul : (ranked.find(([key]) => /^(true|yes)$/i.test(key))?.[1] ?? top?.[1] ?? 0);
  } else if (answer.type === "score") {
    // The service returns the level index; the legend carries the words.
    const level = (raw.score as number | string) ?? top?.[0];
    const legend = (raw.legend ?? undefined) as Record<string, string> | undefined;
    answer.score = level;
    if (legend) answer.legend = legend;
  } else answer.choice = (raw.choice as string) ?? top?.[0];

  return { answer, escalate: confidence < threshold };
}


export { DEFAULT_PATH, DEFAULT_URL };