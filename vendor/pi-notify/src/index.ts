import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

import {
  displayChord,
  MAX_NOTIFICATION_LABEL_LENGTH,
  NOTIFY_CHORD,
  NOTIFY_TOGGLE_EVENT,
} from "./constants";
import { createNotifier } from "./notifier";
import { parseArgs } from "./state";
import { RunTracker } from "./tracker";

function sessionLabel(ctx: ExtensionContext): string {
  let name = ctx.sessionManager.getSessionName();

  if (!name) {
    name = ctx.sessionManager.getSessionId() ?? "session";
  }

  return name.slice(0, MAX_NOTIFICATION_LABEL_LENGTH);
}

export default function (pi: ExtensionAPI): void {
  let enabled = false;

  const tracker = new RunTracker(
    () => enabled,
    createNotifier(),
    () => process.cwd(),
  );

  const toggleMessage = (value: boolean): string =>
    `Notifier ${value ? "ON" : "OFF"}: ${displayChord(NOTIFY_CHORD)} toggles`;

  const notifyToggle = (ctx: ExtensionContext, value: boolean): void => {
    pi.events.emit(NOTIFY_TOGGLE_EVENT, { enabled: value });
    const msg = toggleMessage(value);

    if (ctx.hasUI) {
      ctx.ui.notify(msg, value ? "info" : "warning");
      return;
    }

    console?.log?.(msg);
  };

  const report = (
    ctx: ExtensionContext,
    msg: string,
    level: "info" | "warning",
  ): void => {
    if (ctx.hasUI) {
      ctx.ui.notify(msg, level);
      return;
    }

    console?.log?.(msg);
  };

  pi.registerShortcut(NOTIFY_CHORD, {
    description: "Toggle prompt-completion notifications",

    handler: (ctx) => {
      enabled = !enabled;
      notifyToggle(ctx, enabled);
    },
  });

  pi.registerCommand("notify", {
    description: "Toggle prompt-completion notifications (on/off/status)",
    handler: async (args, ctx) => {
      const action = parseArgs(args, enabled);

      switch (action.kind) {
        case "set":
        case "toggle":
          enabled = action.next;
          notifyToggle(ctx, enabled);
          break;
        case "status":
          report(ctx, toggleMessage(enabled), "info");
          break;
        case "invalid":
          report(ctx, "Usage: /notify [on|off|status]", "warning");
          break;
      }
    },
  });

  pi.on("agent_start", () => tracker.begin());
  pi.on("agent_settled", (_event, ctx) => tracker.settle(sessionLabel(ctx)));
}
