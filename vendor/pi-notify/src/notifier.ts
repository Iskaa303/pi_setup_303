import { spawn, type ChildProcess } from "node:child_process";

import { APP_NAME, NOTIFICATION_ICON, SOUND_PLAYERS } from "./constants";

export interface Notifier {
  notify(summary: string, body: string): void;
}

export function createNotifier(platform = process.platform): Notifier {
  if (platform !== "linux") {
    return {
      notify() {
        console.warn(
          "[pi-notify] desktop notifications are Linux-only, nothing sent",
        );
      },
    };
  }

  return {
    notify(summary, body) {
      sendNotification(summary, body);

      playSound();
    },
  };
}

function sendNotification(summary: string, body: string): void {
  let child: ChildProcess;
  try {
    child = spawn(
      "notify-send",
      ["-a", APP_NAME, "-i", NOTIFICATION_ICON, summary, body],
      { stdio: "ignore" },
    );
  } catch (err) {
    console.warn(
      "[pi-notify] notify-send failed:",
      err instanceof Error ? err.message : String(err),
    );

    return;
  }

  child.on("error", (err) =>
    console.warn("[pi-notify] notify-send failed:", err.message),
  );

  child.unref();
}

function playSound(): void {
  trySound(0);
}

function trySound(index: number): void {
  if (index >= SOUND_PLAYERS.length) return;

  const { cmd, args } = SOUND_PLAYERS[index];
  let child: ChildProcess;

  try {
    child = spawn(cmd, args, { stdio: "ignore" });
  } catch {
    trySound(index + 1);
    return;
  }

  let advanced = false;
  const advance = () => {
    if (advanced) return;

    advanced = true;
    clearTimeout(killer);
    trySound(index + 1);
  };

  const killer = setTimeout(() => child.kill(), 3000);
  killer.unref();

  child.on("error", advance);
  child.on("exit", (code) => {
    if (code !== 0) advance();
  });

  child.unref();
}
