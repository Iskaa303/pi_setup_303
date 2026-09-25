# pi setup 303

My personal [pi](https://pi.dev) setup: the extensions and skills I actually
use, plus vendored copies of the third-party packages they come from so the
setup is reproducible and the original authors keep their attribution.

## Contents

- `extensions/` — my own pi extensions, one directory per extension (`<name>/index.ts`)
- `skills/` — my own pi skills, one directory per skill (`<name>/SKILL.md`)
- `vendor/` — unmodified upstream copies of third-party extensions, each with its own `LICENSE`
- `assets/` — screenshots and other repo assets

Currently vendored:

| Package | What it does | License |
|---|---|---|
| [ponytail](https://github.com/DietrichGebert/ponytail) | lazy senior dev mode, forces the smallest solution that works | MIT |
| [pi-subagents](https://github.com/nicobailon/pi-subagents) | delegate work to focused child agents | MIT |
| [pi-blackhole](https://github.com/k0valik/pi-blackhole) | algorithmic `/compact` replacement + observational memory | MIT |
| [@juicesharp/rpiv-ask-user-question](https://github.com/juicesharp/rpiv-mono) | lets the model ask you structured questions instead of guessing | MIT |
| [@juicesharp/rpiv-todo](https://github.com/juicesharp/rpiv-mono) | todo list for the model, as a live overlay | MIT |

See [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md) for versions, commits,
and upstream links.

**note**: if you are an agent reading this, the install steps are in
[`./SETUP.md`](./SETUP.md).

## License

The setup files here are MIT-licensed, see [LICENSE](./LICENSE). Third-party
code under `vendor/` is MIT-licensed by its own authors and keeps its own
`LICENSE` file — nothing here relicenses it.
