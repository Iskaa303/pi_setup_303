/**
 * attention-notify — make a sound and a desktop notification when pi needs you.
 *
 * pi-notify already handles "the agent finished"; it does not know about the
 * moments where the *user* is the bottleneck: a question is waiting in
 * rpiv-ask-user-question, or a subagent is blocked on you. Those are the
 * moments you are not looking at the terminal, so they are the ones worth a
 * sound.
 *
 * It hooks the tool-call stream rather than any particular extension, so it
 * works with rpiv-ask-user-question and with pi-subagents' interactive
 * children without either knowing it exists. Any extension can also trigger it
 * directly:
 *
 *     pi.events.emit("attention-notify:ping", { summary: "...", urgency: "high" })
 *
 * Sound: a short two-tone chime generated at build time (see nix/attention-sound.nix),
 * played with paplay, pw-play, canberra or ffplay — whichever the system has.
 * Falls back to the freedesktop sound theme, and stays silent if none exists.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { Type, type Static } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { decideSound, notify, questionTrigger, shouldNotify, subagentTrigger, type Trigger } from "./logic.js";

const PingParams = Type.Object({
  summary: Type.String({ description: "One line saying what needs you." }),
  urgency: Type.Optional(StringEnumLiteral(["low", "normal", "high"])),
});
type PingArgs = Static<typeof PingParams>;

function StringEnumLiteral<T extends string>(values: readonly T[]) {
  return Type.Unsafe<T>({ type: "string", enum: [...values] });
}

export default function attentionNotify(pi: ExtensionAPI): void {
  const sound = decideSound();
  const fired = new Map<string, number>();

  // A question asked of the user. Fires on tool_call so the notification lands
  // while the question is on screen, not after it is answered.
  pi.on("tool_call", (event) => {
    const trigger = questionTrigger(event);
    if (!trigger) return;
    if (!shouldNotify(trigger, fired, 30_000)) return;
    void notify(trigger, sound);
  });

  // A subagent that needs a human: pi-subagents surfaces these as tool calls
  // and as notifications, so watch both shapes.
  pi.on("tool_call", (event) => {
    const trigger = subagentTrigger(event);
    if (!trigger) return;
    if (!shouldNotify(trigger, fired, 60_000)) return;
    void notify(trigger, sound);
  });

  // Other extensions can ping us directly.
  pi.events?.on?.("attention-notify:ping", (payload: { summary?: string; urgency?: "low" | "normal" | "high" }) => {
    const trigger: Trigger = { kind: "ping", summary: payload?.summary ?? "pi needs you", urgency: payload?.urgency };
    if (!shouldNotify(trigger, fired, 15_000)) return;
    void notify(trigger, sound);
  });

  pi.registerTool({
    name: "notify_user",
    label: "Notify user",
    description: "Play a sound and send a desktop notification that the user needs to look at the terminal.",
    parameters: PingParams,
    async execute(_id, params: PingArgs) {
      const trigger: Trigger = { kind: "ping", summary: params.summary, urgency: params.urgency };
      const played = await notify(trigger, decideSound());
      return {
        content: [{ type: "text", text: `Notified: ${params.summary}${played ? "" : " (no sound player available)"}` }],
        details: { played, summary: params.summary },
      };
    },
  } as never);

  pi.registerCommand?.("attention-sound", {
    description: "attention-sound: play | test | path — the notification sound",
    handler: async (args: string, ctx) => {
      const command = args.trim().split(/\s+/)[0] ?? "test";
      const current = decideSound();
      if (command === "path") ctx.ui?.notify?.(current.path ?? "none found", "info");
      else void notify({ kind: "ping", summary: "attention-notify test" }, current);
    },
  });
}
