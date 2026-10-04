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
