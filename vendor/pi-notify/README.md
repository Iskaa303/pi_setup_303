# @leo-alvarenga/pi-notify

Desktop notification when a [Pi](https://github.com/earendil-works/pi-mono) prompt settles; after the model finishes all turns, tool calls, retries, and compaction. Linux-only for now: a D-Bus popup (`org.freedesktop.Notifications`) plus a system sound.

## Features

- **Off by default**: nothing is played or shown until you enable it.
- **Opt-in toggle**: `/notify` command or `Alt+Shift+N`.
- **Desktop notification**: via `notify-send` (libnotify), the standard CLI for the freedesktop notification bus.
- **System sound**: tries `canberra-gtk-play`, then `paplay`, then `aplay`; first player that exits 0 wins, silence if none exist.
- **Elapsed time**: the popup shows how long the run took and the project folder name.
- **Session-identified title**: the popup title carries the session name (or its short id) so you can tell which pi instance finished.
- **Session-scoped state**: the toggle resets to OFF on every reload/restart, so you always opt in explicitly.

## Install

```bash
pi install npm:@leo-alvarenga/pi-notify
```

or add the npm spec to your `.pi/settings.json` `packages` and run `/reload`.

## Usage

Enable once per session, then switch away from the terminal:

- `/notify`: toggle on/off
- `/notify on` / `/notify off`: explicit
- `/notify status`: show current state

`Alt+Shift+N` toggles too. Every toggle confirms itself with an in-TUI toast.

The notification fires on pi's `agent_settled` event, i.e. when the run is fully done; no retries, compaction, or queued follow-ups pending.

## Notes

- Linux only. On macOS/Windows the extension loads but notifies nobody
- Notifications fire in every pi mode (TUI, RPC, print) while enabled, no focus detection
- No config files, no persistence: the toggle lives and dies with the session
- The chord is `NOTIFY_CHORD` in `src/constants.ts`; change it there if your terminal eats it

## License

MIT: see [LICENSE](LICENSE). Copyright (c) 2026 Leonardo A. Alvarenga.
