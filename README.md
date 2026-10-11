# pi setup 303

My personal [pi](https://pi.dev) setup: the extensions and skills I actually
use, plus vendored copies of the third-party packages they come from so the
setup is reproducible and the original authors keep their attribution.

Local-first and key-free: the two MCP servers here (REA and Playwright MCP)
drive local engines and browsers; every other tool runs on local or key-free
services.

## Contents

- `extensions/` — my own pi extensions, one directory per extension (`<name>/index.ts`)
- `skills/` — my own pi skills, one directory per skill (`<name>/SKILL.md`)
- `vendor/` — trimmed upstream copies of third-party extensions, each with its own `LICENSE`
- `licenses/` — license texts for everything vendored, called, or depended on
- `assets/` — screenshots and other repo assets
- `nix/locks/` — package-lock.json per extension, so nix builds them hermetically

## Install

Everything is a nix package: pi itself (pinned), the extensions, and the
`settings.json` that loads them. One module:

```nix
inputs.pi-setup.url = "github:Iskaa303/pi_setup_303";
inputs.pi-setup.inputs.nixpkgs.follows = "nixpkgs";

nixpkgs.overlays = [ inputs.pi-setup.overlays.default ];   # pkgs.pi, pinned

hm.imports = [ inputs.pi-setup.homeManagerModules.default ];
programs.pi-setup = { enable = true; camoufox = true; };
```

`~/.pi/agent/settings.json` is written by Nix (a store symlink) with every
extension package plus whatever you put in `programs.pi-setup.settings`. pi's
own `pi install` is not used, so the package list cannot drift between rebuilds.
See [SETUP.md](./SETUP.md) for every option.

```sh
nix build .#ketch-web-access   # any single extension
nix build .#pi-setup           # all of them
nix build .#pi                 # pi itself (pinned version)
nix flake check                # runs the extension unit tests
devenv shell                   # dev environment
```

## pi version

Pinned in `flake.nix` (`piVersion` / `piAssets`) to upstream's prebuilt release
tarball, currently **1.1.0**. Updating your lock cannot move it; bumping is a
deliberate edit of those two attributes plus `nix build .#pi --refresh`.

## Currently vendored

| Package | What it does | License |
|---|---|---|
| [ponytail](https://github.com/DietrichGebert/ponytail) | lazy senior dev mode, forces the smallest solution that works | MIT |
| [pi-subagents](https://github.com/nicobailon/pi-subagents) | delegate work to focused child agents | MIT |
| [pi-blackhole](https://github.com/k0valik/pi-blackhole) | algorithmic `/compact` replacement + observational memory | MIT |
| [@juicesharp/rpiv-ask-user-question](https://github.com/juicesharp/rpiv-mono) | lets the model ask you structured questions instead of guessing | MIT |
| [@juicesharp/rpiv-todo](https://github.com/juicesharp/rpiv-mono) | todo list for the model, as a live overlay | MIT |
| [@leo-alvarenga/pi-notify](https://pi.dev/packages/@leo-alvarenga/pi-notify) | desktop notifications when the agent needs you | MIT |
| [@narumitw/pi-statusline](https://pi.dev/packages/@narumitw/pi-statusline) | the status line | MIT |
| [@ff-labs/pi-fff](https://pi.dev/packages/@ff-labs/pi-fff) | fuzzy file and content search (`fffind`) | MIT |

Not vendored, written here, five extensions of my own:

- [`extensions/ketch-web-access`](./extensions/ketch-web-access)
replaces pi-web-access with Ketch as the only web provider, registering the
`web_search`, `fetch_content`, `get_search_content`, and `source_check` tools
that pi-subagents' `researcher` and `evidence-auditor` builtins require. Search
runs on keyless DuckDuckGo or a self-hosted SearXNG, pages are extracted with
Ketch's readability pipeline, and hard pages can be fetched with
[Camoufox](https://camoufox.com), a real anti-detect Firefox, through
Playwright. It is derived from pi-web-access and pi-ketch, both MIT — see its
README and `licenses/`.
- [`extensions/decider`](./extensions/decider) — typed choice/noul/score
  decisions from any service that answers `POST /v1/systemone`, such as
  [Mapika/decider](https://github.com/Mapika/decider) (Apache-2.0). Ships no
  model and no runtime: the extension is an HTTP client, so with nothing
  listening it reports the URL that did not answer and gets out of the way.
- [`extensions/attention-notify`](./extensions/attention-notify) — a chime and a
  desktop notification when a question is waiting for you or a subagent blocks
  on you. The chime is synthesised by ffmpeg at build time, so no audio is
  vendored.
- [`extensions/tui`](./extensions/tui) — drive and test programs that expect a
  human at the keyboard (REPLs, debuggers, pagers, editors, full-screen TUI
  apps) with [agent-tui](https://github.com/pproenca/agent-tui), a Rust CLI that
  runs the program in a virtual terminal. This flake packages agent-tui's
  prebuilt binary; the extension exposes `tui_run`, `tui_screenshot`,
  `tui_type`, `tui_press`, `tui_wait`, `tui_kill`, and `tui_sessions`.
- [`extensions/rea-mcp`](./extensions/rea-mcp) — connects pi to
  [REA](https://github.com/morluto/rea), one MCP server for reverse engineering:
  Ghidra-backed native binaries, JavaScript/Electron, .NET, firmware and
  websites, with Chromium for browser analysis. The flake packages the `rea`
  CLI, the MCP server and REA's `reverse-engineer-anything` skill from the npm
  release; the extension registers the server at load time, so
  `~/.pi/agent/mcp.json` is never written. Ghidra, Chromium, pwntools, Binwalk,
  Unblob and mitmdump come from nix and are pointed at with absolute paths.
- [`extensions/playwright-mcp`](./extensions/playwright-mcp) — registers
  [Playwright MCP](https://github.com/microsoft/playwright-mcp), so pi can drive
  a real browser (navigate, click, type, snapshot, run JS) instead of only
  fetching pages. It is the npm release pointed at nixpkgs Chromium; Playwright's
  own browser download is skipped, so nothing extra is shipped.

See [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md) for versions, commits,
and upstream links, [licenses/](./licenses) for every license text, and
[SETUP.md](./SETUP.md) for the low-level manual steps.

**note**: if you are an agent reading this, the install steps are in
[`./SETUP.md`](./SETUP.md).

## License

The setup files here are MIT-licensed, see [LICENSE](./LICENSE). Third-party
code under `vendor/` is MIT-licensed by its own authors and keeps its own
`LICENSE` file — nothing here relicenses it.