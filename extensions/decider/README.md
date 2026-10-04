# decider

Typed System One decisions for pi, over HTTP.

[decider](https://github.com/Mapika/decider) (Mapika, Apache-2.0) is a family of
dense models fine-tuned from Qwen3.5 that do not generate text. You give one a
state and typed questions — `choice`, `noul`, `score` — and it returns a
probability distribution over the options for every question **from one forward
pass**. It is the open equivalent of TypeSafe's paid Jev, which needs an API key
and therefore does not belong in this setup.

## This extension is a client, and only a client

It ships no model, no weights and no runtime. It POSTs to
`http://127.0.0.1:8137/v1/systemone` (override with `DECIDER_URL`) and renders
whatever comes back. That means:

- **no `/decider` command and no on/off state** — there is nothing here to switch
  off. Whether the model is loaded is the service's business, not pi's.
- **no permission prompt** — a call to an HTTP endpoint does not need the user to
  approve it first, and the old gate only ever added a turn and a place to
  record an answer nobody gave.
- **no status line** — `decider: on` described a switch that no longer exists.
- **subagents may use it** — it is an ordinary remote call, and a child session
  asking "does this need the web?" is exactly the routing question it is for.
- an unreachable service costs nothing: no weights, no memory, no VRAM, just a
  note naming the URL that did not answer

## Environment

| variable | default | meaning |
|---|---|---|
| `DECIDER_URL` | `http://127.0.0.1:8137` | where the service lives |
| `DECIDER_PATH` | `/v1/systemone` | endpoint |
| `DECIDER_MODEL` | `decider` | model name sent in the request |
| `DECIDER_THRESHOLD` | `0.8` | below this an answer is flagged `escalate` |

## The tool

`system_one_decide` — the extension is `decider`, the tool is not, and that
difference has caused a wasted detour before, so the prompt snippet says so.

One call, several questions, so they share a single forward pass:

```json
{
  "state": "the text the decision is about",
  "questions": [
    { "name": "route", "type": "choice", "instructions": "...",
      "criteria": { "web": "needs the network", "code": "touches the repo" } }
  ]
}
```

`criteria` is an object of option → description for `choice`, `{true, false}` for
`noul`, and a **list of level descriptions** for `score`. Give every option a
real description: bare labels give the model nothing to score.

Answers come back as `- name: value (NN%, escalate)` plus the full option
distribution, and any answer under the threshold is flagged so the model verifies
it against the text instead of trusting it.

## Building the service

Not part of this repo — see [SETUP.md](../../SETUP.md) for the wire contract and
the two nix gotchas (Hub LFS needs `fetchLFS`; CUDA torch is unfree).