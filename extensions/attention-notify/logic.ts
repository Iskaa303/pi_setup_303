/**
 * Sound and desktop notification helpers for the attention-notify extension.
 * Free of pi and typebox imports so they can be unit-tested directly.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

export interface Trigger {
  kind: "question" | "subagent" | "ping";
  summary: string;
  urgency?: "low" | "normal" | "high";
}

export interface SoundChoice {
  /** file to play */
  path?: string;
  /** argv prefix that plays it */
  player?: [string, string[]];
  label: string;
}

/** Players we try, in order. The first that exists wins. */
const PLAYERS: SoundChoice[] = [
  { path: process.env.PI_ATTENTION_SOUND, player: ["paplay", ["-"]], label: "paplay" },
  { path: process.env.PI_ATTENTION_SOUND, player: ["pw-play", ["-"]], label: "pw-play" },
  { path: "/usr/share/sounds/freedesktop/stereo/complete.oga", player: ["paplay", []], label: "freedesktop complete" },
  { path: "/usr/share/sounds/freedesktop/stereo/message.oga", player: ["paplay", []], label: "freedesktop message" },
  { path: "/usr/share/sounds/alsa/Front_Center.wav", player: ["aplay", ["-q"]], label: "alsa Front_Center" },
];

export function hasCommand(command: string): boolean {
  return spawnSync("sh", ["-c", `command -v ${command}`], { stdio: "ignore" }).status === 0;
}

export function decideSound(env: NodeJS.ProcessEnv = process.env): SoundChoice | undefined {
  for (const candidate of PLAYERS) {
    if (!candidate.path || !existsSync(candidate.path)) continue;
    const [command, args] = candidate.player ?? [];
    if (!hasCommand(command)) continue;
    return { ...candidate, player: [command, args] };
  }
  return undefined;
}

/** pi reports the tool in `toolName`; be tolerant about the shape. */
export function toolNameOf(event: unknown): string {
  const e = event as { toolName?: unknown; tool_name?: unknown; name?: unknown } | null;
  const name = [e?.toolName, e?.tool_name, e?.name].find((v) => typeof v === "string" && v);
  return typeof name === "string" ? name : "";
}

/**
 * The moments where the *user* is the bottleneck. Pure so they can be tested:
 * this used to live in index.ts, where nothing ran it.
 */
export function questionTrigger(event: unknown): Trigger | undefined {
  if (!/ask[_-]?user|question/i.test(toolNameOf(event))) return undefined;
  return { kind: "question", summary: "pi is asking you a question" };
}

/** A subagent blocked on a human: the subagent tool plus a question in its args. */
export function subagentTrigger(event: unknown): Trigger | undefined {
  if (!/subagent/i.test(toolNameOf(event))) return undefined;
  const args = JSON.stringify((event as { arguments?: unknown } | null)?.arguments ?? "");
  if (!/ask[_-]?user|question|permission|approve|confirm/i.test(args)) return undefined;
  return { kind: "subagent", summary: "A subagent needs your input" };
}

/** Rate-limit repeats so a retry loop does not machine-gun the user. */
export function shouldNotify(trigger: Trigger, store: Map<string, number>, windowMs: number, now = Date.now()): boolean {
  const key = `${trigger.kind}:${trigger.summary}`;
  const last = store.get(key);
  store.set(key, now);
  return last === undefined || now - last >= windowMs;
}

/** Desktop notification; silent no-op when no notifier exists. */
export async function desktopNotify(summary: string, urgency: Trigger["urgency"] = "normal"): Promise<boolean> {
  for (const command of ["notify-send", "gdbus"]) {
    if (!hasCommand(command)) continue;
    const args =
      command === "notify-send"
        ? ["--app-name=pi", `--urgency=${urgency ?? "normal"}`, summary]
        : [
            "call",
            "--dest",
            "org.freedesktop.Notifications",
            "--object-path",
            "/org/freedesktop/Notifications",
            "--method",
            "org.freedesktop.Notifications.Notify",
            "pi",
            "",
            "dialog-information",
            summary,
            "[]",
            "{\"urgency\":0}",
            "0",
          ];
    return await new Promise<boolean>((resolve) => {
      const child = spawn(command, args, { stdio: "ignore" });
      child.on("error", () => resolve(false));
      child.on("close", (code) => resolve(code === 0));
    });
  }
  return false;
}

/** Play the chosen sound; returns whether anything was actually played. */
export async function playSound(sound: SoundChoice | undefined): Promise<boolean> {
  if (!sound?.path || !sound.player) return false;
  const [command, args] = sound.player;
  return await new Promise<boolean>((resolve) => {
    const child = spawn(command, [...args, sound.path as string], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    // Players exit 0 even when the audio backend is missing, so a timeout is
    // the only honest signal that nothing came out.
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve(false);
    }, 5_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

export async function notify(trigger: Trigger, sound: SoundChoice | undefined): Promise<boolean> {
  const [played, shown] = await Promise.all([playSound(sound), desktopNotify(trigger.summary, trigger.urgency)]);
  return played || shown;
}
