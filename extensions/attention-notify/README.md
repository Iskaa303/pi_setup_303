# attention-notify

Make a sound and a desktop notification **when pi needs you**, not when the
agent finishes.

[pi-notify](../vendor/pi-notify) already covers "the run settled". This covers
the moments where *you* are the bottleneck and you are probably not looking at
the terminal:

- a question is waiting in [rpiv-ask-user-question](../vendor/rpiv-mono/packages/rpiv-ask-user-question)
- a [pi-subagents](../vendor/pi-subagents) child is blocked on you

It hooks pi's `tool_call` stream rather than any one extension, so neither
rpiv-ask-user-question nor pi-subagents has to know it exists.

## Other extensions can ping it

```ts
pi.events.emit("attention-notify:ping", { summary: "waiting on you", urgency: "high" });
```

## Sound

`PI_ATTENTION_SOUND` points at a chime this flake **generates** with ffmpeg
(`nix/attention-sound.nix`) — two decaying sine blips, 320 ms, mono. It is
synthesised rather than downloaded, so there is no vendored audio and no
license question. Players are tried in order: `paplay`, `pw-play`, then the
freedesktop/alsa system sounds; if none exist, the desktop notification still
fires and stays silent.

`/attention-sound test` plays it, `/attention-sound path` prints what it picked.

## De-duplication

Notifications are rate-limited per trigger (30 s for a question, 60 s for a
subagent, 15 s for a direct ping) so a retry loop cannot machine-gun you.

## Test

```sh
npm test
```
