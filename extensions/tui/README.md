# tui

Let pi drive and test programs that expect a human at the keyboard — REPLs,
debuggers, pagers, editors, installers, full-screen TUI apps — which bash
pipelines cannot reach.

It is a thin client over [`agent-tui`](https://github.com/pproenca/agent-tui)
(MIT), a Rust CLI that runs a program in a virtual terminal and exposes its
screen and keystrokes over JSON:

```
tui_run → tui_wait → tui_press / tui_type → tui_screenshot → tui_kill
```

| Tool | Purpose |
|---|---|
| `tui_run` | start a program, return its `session_id` and first settled screen |
| `tui_screenshot` | read the current screen as plain text |
| `tui_type` | type literal text (optional Enter) |
| `tui_press` | press named keys: `Enter`, `Escape`, `Ctrl+C`, arrows, `F1`–`F10` |
| `tui_wait` | wait for text (or screen stability) before acting |
| `tui_kill` | end the session |
| `tui_sessions` | list sessions; recover a lost `session_id` |

Every action that can change the UI is followed by a screen read, so the model
never acts on a half-rendered screen.

## The binary

`agent-tui` is packaged by this flake (`nix build .#agent-tui`) from upstream's
prebuilt release binaries and put on `PATH`. `AGENT_TUI_BIN` overrides the
binary the extension runs; without it the extension looks for `agent-tui` on
`PATH` and reports the missing binary rather than failing silently.

Session state lives in `$XDG_RUNTIME_DIR/agent-tui.sock` and `~/.agent-tui`, and
the daemon starts on first use.

## Test

```sh
node --experimental-strip-types --test test/*.test.ts
```

The tests cover the CLI contract (argument builders and JSON parsers) without
spawning a terminal; `nix flake check` runs the same suite.