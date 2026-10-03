import { basename } from "node:path";

import { formatDuration } from "@leo-alvarenga/pi-ext-core";

import type { Notifier } from "./notifier";

export class RunTracker {
  private running = false;
  private startedAt = 0;

  constructor(
    private readonly enabled: () => boolean,
    private readonly notifier: Notifier,
    private readonly cwd: () => string,
  ) {}

  begin(): void {
    this.running = true;
    this.startedAt = Date.now();
  }

  settle(label: string): void {
    if (!this.running) return;

    this.running = false;
    if (!this.enabled()) return;

    const project = basename(this.cwd()) || "?";
    const elapsed = formatDuration(Date.now() - this.startedAt);
    this.notifier.notify(
      `Pi ${label} done`,
      `Finished in ${elapsed} · ${project}`,
    );
  }
}
