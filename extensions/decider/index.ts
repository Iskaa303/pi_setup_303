/**
 * decider — typed decisions from a local (or remote) decision service.
 *
 * It is a thin HTTP client and nothing else: the model, its weights and its
 * runtime are somebody else's package to build. Point DECIDER_URL at anything
 * that answers POST /v1/systemone and the tool works; when nothing answers, the
 * tool says so once and gets out of the way. No on/off switch, because there is
 * nothing here to switch off — the service's own lifecycle is not ours.
 */

import { Type, type Static } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  DEFAULT_PATH,
  DEFAULT_URL,
  normaliseAnswer,
  post,
  unreachableText,
} from "./logic.js";

const DecideParams = Type.Object({
  state: Type.String({ description: "The text the decision is about: the user request, tool output, error, or diff." }),
  questions: Type.Array(
    Type.Object({
      name: Type.String({ description: "Short identifier for the question, e.g. route or urgent." }),
      type: Type.Union([Type.Literal("choice"), Type.Literal("noul"), Type.Literal("score")]),
      instructions: Type.String(),
      criteria: Type.Optional(Type.Union([Type.Record(Type.String(), Type.String()), Type.Array(Type.String())])),
    }),
    { description: 'The questions to answer, e.g. [{name: "route", type: "choice", instructions: "...", criteria: {web: "...", code: "..."}}]' },
  ),
  threshold: Type.Optional(Type.Number({ description: "Escalate when confidence is below this (default 0.8)." })),
});
type DecideArgs = Static<typeof DecideParams>;

const url = () => `${process.env.DECIDER_URL ?? DEFAULT_URL}${process.env.DECIDER_PATH ?? DEFAULT_PATH}`;
const threshold = () => Number(process.env.DECIDER_THRESHOLD ?? 0.8);

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }], details: { unavailable: true } };
}

export default function decider(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "system_one_decide",
    label: "System One decision (local service)",
    description:
      "Ask a decider model a set of typed choice/noul/score questions about a piece of text and get calibrated probabilities from one forward pass. Use it for routing (which tool, which surface) and for escalate-or-not decisions. It talks to an HTTP service (127.0.0.1:8137 by default, DECIDER_URL to change); if nothing answers, the tool reports that and you decide without it.",
    promptSnippet:
      "system_one_decide: typed choice/noul/score questions with calibrated probabilities from a local decision service; only for routing and escalate-or-not calls, never for facts.",
    promptGuidelines: [
      "Call it as system_one_decide (the extension is named decider; the tool is not).",
      "questions is a LIST of {name, type, instructions, criteria} objects.",
      "One call with several questions — they share a single forward pass.",
      "Give options explicit descriptions in `criteria`; bare labels give the model nothing to score.",
      "If an answer comes back as escalate, do the careful thing yourself instead of guessing.",
    ],
    parameters: DecideParams,
    async execute(_id, params: DecideArgs) {
      const questions = params.questions.reduce<Record<string, unknown>>((all, question) => {
        const { name, ...rest } = question;
        all[name] = rest;
        return all;
      }, {});
      const reply = await post(
        url(),
        { model: process.env.DECIDER_MODEL ?? "decider", state: params.state, questions },
        180_000,
      );
      if (reply.error || reply.status !== 0) {
        return textResult(unreachableText(url(), reply.error ?? `exit ${reply.status}`));
      }

      const answers = (reply.body as { answers?: Record<string, Record<string, unknown>> })?.answers ?? {};
      const limit = params.threshold ?? threshold();
      const rows: string[] = [];
      let escalateCount = 0;
      for (const [name, raw] of Object.entries(answers)) {
        const { answer, escalate } = normaliseAnswer(raw, limit);
        if (escalate) escalateCount += 1;
        const level = answer.legend ? `${answer.score} (${answer.legend[String(answer.score)] ?? "?"})` : answer.score;
        const value = answer.type === "noul" ? answer.noul : (answer.choice ?? level);
        const options = Object.entries(answer.probabilities ?? {});
        rows.push(
          `- ${name}: ${value ?? "?"} (${((answer.confidence ?? 0) * 100).toFixed(0)}%${escalate ? ", escalate" : ""})` +
            (options.length ? `\n  options: ${options.map(([key, value]) => `${key} ${(value * 100).toFixed(0)}%`).join(", ")}` : ""),
        );
      }

      const body = [
        `decide (${process.env.DECIDER_MODEL ?? "decider"}, threshold ${limit}):`,
        ...(rows.length ? rows : ["- no answers returned"]),
        escalateCount > 0 ? `\n${escalateCount} answer(s) below threshold: verify them against the text before relying on them.` : "",
        "These are one model's opinions with no access to the conversation; treat low-margin answers as a hint, not a fact.",
      ]
        .filter(Boolean)
        .join("\n");

      return { content: [{ type: "text", text: body }], details: { answers, escalateCount, threshold: limit } };
    },
  } as never);
}