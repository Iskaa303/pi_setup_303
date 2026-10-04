/**
 * decider — local System One decisions, off by default.
 *
 * decider-4b (Mapika, Apache-2.0) answers typed choice/noul/score questions
 * with calibrated probabilities in one forward pass, with no text generation.
 * It is the local, open alternative to TypeSafe's paid Jev.
 *
 * Battery matters: a 4B model on a laptop is not something to spin up because a
 * tool name appeared in context. So nothing is loaded until the user says so:
 *
 *   - disabled by default; the extension itself imports no model runtime
 *   - the first `decide` call asks for permission (through
 *     rpiv-ask-user-question when loaded, otherwise by telling the model to
 *     ask) and remembers the answer either way
 *   - a refusal is permanent until `/decider on`
 *   - subagents never load it: a child session has no user to ask
 *
 * The model runs as a separate service (`packages.decider-server`); this
 * extension only speaks HTTP, so an unreachable server costs nothing.
 */

import { Type, type Static } from "typebox";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  DEFAULT_PATH,
  DEFAULT_URL,
  findAskTool,
  isChildSession,
  normaliseAnswer,
  post,
  requestPermission,
  SessionStore,
  type State,
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
  permission: Type.Optional(Type.Boolean({
    description: "Set on the retry, after the user answered whether to load this model: true if they said yes, false if they said no.",
  })),
  threshold: Type.Optional(Type.Number({ description: "Escalate when confidence is below this (default 0.8)." })),
});
type DecideArgs = Static<typeof DecideParams>;

const url = () => `${process.env.DECIDER_URL ?? DEFAULT_URL}${process.env.DECIDER_PATH ?? DEFAULT_PATH}`;
const threshold = () => Number(process.env.DECIDER_THRESHOLD ?? 0.8);

const disabledText = (reason: string) =>
  `The local decision model is ${reason}. Continue without it: decide from the conversation and say what you assumed. Do not retry this tool.`;

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }], details: { unavailable: true } };
}

function statusText(state: State, child: boolean): string {
  if (child) return "decider: off (subagent)";
  return state.enabled ? "decider: on" : "decider: off";
}

export default function decider(pi: ExtensionAPI): void {
  // Session-scoped: nothing is written to disk, and a new session starts off
  // again without asking about a decision this one already made.
  const store = new SessionStore();
  const sessionId = (ctx: ExtensionContext) => ctx.sessionManager?.getSessionId?.() ?? "default";

  const setStatus = (ctx: ExtensionContext) => {
    const ui = (ctx as unknown as { ui?: { setStatus?: (key: string, text: string | undefined) => void } }).ui;
    ui?.setStatus?.("decider", statusText(store.get(sessionId(ctx)), isChildSession(ctx as never)));
  };

  pi.registerCommand?.("decider", {
    description: "decider: on | off | status | reset — enable or disable the local decision model (this session)",
    handler: async (args: string, ctx: ExtensionContext) => {
      const command = args.trim().split(/\s+/)[0] ?? "status";
      const id = sessionId(ctx);
      if (command === "on") store.set(id, { enabled: true, declined: false });
      else if (command === "off") store.set(id, { enabled: false });
      else if (command === "reset") store.set(id, { enabled: false, declined: false });
      setStatus(ctx);
      ctx.ui?.notify?.(
        command === "status" || command === ""
          ? `${statusText(store.get(id), isChildSession(ctx as never))} — /decider on | off | reset`
          : `decider ${command === "reset" ? "reset" : command === "on" ? "on" : "off"}`,
        "info",
      );
    },
  });

  pi.registerTool({
    name: "system_one_decide",
    label: "System One decision (local model)",
    description:
      "Ask the local decider-4b model a set of typed choice/noul/score questions about a piece of text and get calibrated probabilities in one forward pass. Use it for routing (which tool, which surface) and for escalate-or-not decisions. Off by default: the first call asks the user for permission, and remembers the answer either way.",
    promptSnippet:
      "system_one_decide: typed choice/noul/score questions with calibrated probabilities from a local model; only for routing and escalate-or-not calls, never for facts.",
    promptGuidelines: [
      "Call it as system_one_decide (the extension is named decider; the tool is not).",
      "questions is a LIST of {name, type, instructions, criteria} objects.",
      "If the result says the model is off and unauthorised, ask the user with ask_user_question (\"load the local decision model?\"), then call system_one_decide again with permission: true or false.",
      "One call with several questions — they share a single forward pass.",
      "Give options explicit descriptions in `criteria`; bare labels give the model nothing to score.",
      "If an answer comes back as escalate, do the careful thing yourself instead of guessing.",
    ],
    parameters: DecideParams,
    async execute(_id, params: DecideArgs, _signal, _update, ctx: ExtensionContext) {
      const id = sessionId(ctx);
      const state = store.get(id);

      if (isChildSession(ctx as never)) return textResult(disabledText("not available in subagents"));
      if (state.declined && !state.enabled) return textResult(disabledText("you turned it off for this session"));

      if (!state.enabled) {
        // The model relays the answer back, so the user is never asked by us
        // directly and nothing is assumed on their behalf.
        if (params.permission === undefined) {
          const asked = await requestPermission({
          tools: (ctx as unknown as { tools?: unknown }).tools,
          store,
          sessionId: id,
          callTool: (name, params) => ctx.executeTool(name, params as never),
          notify: (message) => ctx.ui?.notify?.(message, "info"),
        });
          if (asked === undefined) {
            return textResult(
              "The local decision model is off and I cannot ask you from inside a tool. Ask the user with ask_user_question (\"load the local decision model (decider-4b, 4B params)?\", options \"Turn it on\" / \"Keep it off\"), then call system_one_decide again with permission: true or false. Do not retry without asking.",
            );
          }
          if (!asked) return textResult(disabledText("the user declined permission to load it"));
        } else {
          store.set(id, params.permission ? { enabled: true, declined: false } : { enabled: false, declined: true, declinedAt: Date.now() });
          if (!params.permission) return textResult(disabledText("you declined permission to load it"));
        }
      }

      const questions = params.questions.reduce<Record<string, unknown>>((all, question) => {
        const { name, ...rest } = question;
        all[name] = rest;
        return all;
      }, {});
      const reply = await post(
        url(),
        { model: process.env.DECIDER_MODEL ?? "decider-4b", state: params.state, questions },
        180_000,
      );
      if (reply.error || reply.status !== 0) {
        return textResult(
          `decider service unreachable at ${url()} (${reply.error ?? `exit ${reply.status}`}). Start it with: systemctl --user start decider. Decide without it.`,
        );
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
        `decide (${process.env.DECIDER_MODEL ?? "decider-4b"}, threshold ${limit}):`,
        ...(rows.length ? rows : ["- no answers returned"]),
        escalateCount > 0 ? `\n${escalateCount} answer(s) below threshold: verify them against the text before relying on them.` : "",
        "These are one model's opinions with no access to the conversation; treat low-margin answers as a hint, not a fact.",
      ]
        .filter(Boolean)
        .join("\n");

      return { content: [{ type: "text", text: body }], details: { answers, escalateCount, threshold: limit } };
    },
  } as never);

  pi.on("session_start", (_event, ctx: ExtensionContext) => setStatus(ctx));
  // Forget the decision with the session that made it.
  pi.on("session_shutdown", (_event, ctx: ExtensionContext) => {
    store.drop(sessionId(ctx));
    ctx.ui?.setStatus?.("decider", undefined);
  });
}

/** Ask once through rpiv-ask-user-question, remembering the answer for this session. */
