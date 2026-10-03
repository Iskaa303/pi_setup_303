# pi setup 303

My personal [pi](https://pi.dev) setup: the extensions and skills I actually
use, plus vendored copies of the third-party packages they come from so the
setup is reproducible and the original authors keep their attribution.

No MCP, no API keys: every tool here runs on local or key-free services.

## Contents

- `extensions/` — my own pi extensions, one directory per extension (`<name>/index.ts`)
- `skills/` — my own pi skills, one directory per skill (`<name>/SKILL.md`)
- `vendor/` — trimmed upstream copies of third-party extensions, each with its own `LICENSE`
- `assets/` — screenshots and other repo assets
- `nix/locks/` — package-lock.json per extension, so nix builds them hermetically

## Install

Everything is a nix package. Add the flake, import one module:

```nix
inputs.pi-setup.url = "github:<you>/pi_setup_303";

hm.imports = [ inputs.pi-setup.homeManagerModules.default ];
programs.pi-setup.enable = true;   # under programs.*
```

It builds on [pi-flake](https://github.com/ChauDucToan/pi-flake), so pi itself
keeps coming from pi-flake; this flake only adds the extensions, `ketch`, and
the env the web extension needs. See [SETUP.md](./SETUP.md) for the full option
list and for a plain NixOS (non-Home-Manager) variant.

```sh
nix build .#ketch-web-access   # any single extension
nix build .#pi-setup           # all of them
nix flake check                # runs the extension unit tests
devenv shell                   # dev environment (ketch, ffmpeg, yt-dlp, camoufox libs)
```

## Currently vendored

| Package | What it does | License |
|---|---|---|
| [ponytail](https://github.com/DietrichGebert/ponytail) | lazy senior dev mode, forces the smallest solution that works | MIT |
| [pi-subagents](https://github.com/nicobailon/pi-subagents) | delegate work to focused child agents | MIT |
| [pi-blackhole](https://github.com/k0valik/pi-blackhole) | algorithmic `/compact` replacement + observational memory | MIT |
| [@juicesharp/rpiv-ask-user-question](https://github.com/juicesharp/rpiv-mono) | lets the model ask you structured questions instead of guessing | MIT |
| [@juicesharp/rpiv-todo](https://github.com/juicesharp/rpiv-mono) | todo list for the model, as a live overlay | MIT |

Not vendored, written here: [`extensions/ketch-web-access`](./extensions/ketch-web-access)
replaces pi-web-access with Ketch as the only web provider, registering the
`web_search`, `fetch_content`, `get_search_content`, and `source_check` tools
that pi-subagents' `researcher` and `evidence-auditor` builtins require. Search
runs on keyless DuckDuckGo or a self-hosted SearXNG, pages are extracted with
Ketch's readability pipeline, and hard pages can be fetched with
[Camoufox](https://camoufox.com), a real anti-detect Firefox, through
Playwright. It is derived from pi-web-access and pi-ketch, both MIT — see its
README and `licenses/`.

See [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md) for versions, commits,
and upstream links, and [SETUP.md](./SETUP.md) for the low-level manual steps.

**note**: if you are an agent reading this, the install steps are in
[`./SETUP.md`](./SETUP.md).

## License

The setup files here are MIT-licensed, see [LICENSE](./LICENSE). Third-party
code under `vendor/` is MIT-licensed by its own authors and keeps its own
`LICENSE` file — nothing here relicenses it.