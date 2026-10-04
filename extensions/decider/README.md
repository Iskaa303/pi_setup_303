# decider

Local System One decisions for pi, **off by default**.

[decider-4b](https://huggingface.co/mapika/decider-4b) (Mapika, Apache-2.0) is a
4B dense model fine-tuned from Qwen3.5-4B-Base that does not generate text. You
give it a state and typed questions — `choice`, `noul`, `score` — and it returns
a probability distribution over the options for every question **from one forward
pass**. It is the local, open equivalent of TypeSafe's paid Jev (which needs an
API key and therefore does not belong in this setup).

On JevBench's public hard tier decider reaches **0.676** where von reaches 0.373
and Laya 0.341 — the 400M encoders are the weakest serious entry in this class.

## Why it is off by default

A 4B model on a laptop is not something to spin up because a tool name appeared
in context. So:

- the extension imports **no model runtime**; it only speaks HTTP to a service
- the first `decide` call asks the user for permission, through
  [rpiv-ask-user-question](../vendor/rpiv-mono/packages/rpiv-ask-user-question)
  when it is loaded, and remembers the answer either way
- a refusal is permanent until `/decider on`
- **subagents never load it**: a child session has no user to ask, so `decide`
  returns "unavailable, decide without it"
- an unreachable service costs nothing — no weights, no memory, just a note

## Commands

| Command | Effect |
|---|---|
| `/decider` or `/decider status` | show whether it is on, off or declined |
| `/decider on` | enable it and load weights on the next `decide` |
| `/decider off` | disable without forgetting a previous refusal |
| `/decider reset` | forget a refusal, so the next call asks again |

The status line shows `decider: on` / `off` / `declined` through
[pi-statusline](../vendor/pi-statusline)'s extension-status row.

## The tool

```jsonc
// one call, several questions, one forward pass
decide({
  state: "Tool 'ketch_browser' is not a browser… /tmp/x 404 …",
  questions: {
    route:  { type: "choice", instructions: "How should this be handled?",
              criteria: { fetch_tool: "use fetch_content", ask_user: "ask the user" } },
    urgent: { type: "noul",  instructions: "Is the user blocked?" }
  },
  threshold: 0.8
})
```

Answers below `threshold` (default 0.8, `DECIDER_THRESHOLD`) come back marked
`escalate`: that is a signal to verify, not a fact. The tool's own guidance
says the same — it has no access to the conversation.

## The service

The extension expects an HTTP service (von-compatible `/v1/systemone` by
default, override with `DECIDER_URL` / `DECIDER_PATH`). See SETUP.md for
`packages.decider-server` and how to start it; state lives in
`~/.pi/agent/decider/state.json`.

## Attribution

Uses [decider-4b](https://huggingface.co/mapika/decider-4b) (Apache-2.0) and
[Mapika/decider](https://github.com/Mapika/decider) (Apache-2.0) at runtime.
Neither is vendored here.
