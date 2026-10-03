export type NotifyAction =
  | { kind: "set"; next: boolean }
  | { kind: "toggle"; next: boolean }
  | { kind: "status"; enabled: boolean }
  | { kind: "invalid" };

export function parseArgs(args: string, enabled: boolean): NotifyAction {
  switch (args.trim().toLowerCase()) {
    case "on":
      return { kind: "set", next: true };
    case "off":
      return { kind: "set", next: false };
    case "":
      return { kind: "toggle", next: !enabled };
    case "status":
      return { kind: "status", enabled };
    default:
      return { kind: "invalid" };
  }
}
