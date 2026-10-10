# Third-party notices

The packages under `vendor/` are unmodified copies of upstream repositories,
vendored so this setup is reproducible and so the original authors keep
attribution. Each copy keeps its upstream `LICENSE` file in place.

| Package | Upstream | Version | Commit | License |
|---|---|---|---|---|
| ponytail | https://github.com/DietrichGebert/ponytail | 5.1.0 | `9cc65d03aa2da1db7121b912d03596409ee340b8` | MIT, © 2026 DietrichGebert |
| pi-subagents | https://github.com/nicobailon/pi-subagents | 0.77.0 | `1ac9b964eb9cda1662507c52f5277764637daccc` | MIT, © 2026 Nico Bailon |
| pi-blackhole | https://github.com/k0valik/pi-blackhole | 0.5.12 | `a2e4c136bb0e8775cca0e8b2583f5d24e86776fb` | MIT, © 2026 k0valik |
| @juicesharp/rpiv-ask-user-question | https://github.com/juicesharp/rpiv-mono (`packages/rpiv-ask-user-question`) | 2.12.0 | `7c9bc924c5bfd148f36d7ebc9f7bd0a9469d633f` | MIT, © 2026 juicesharp |
| @juicesharp/rpiv-todo | https://github.com/juicesharp/rpiv-mono (`packages/rpiv-todo`) | 2.12.0 | `7c9bc924c5bfd148f36d7ebc9f7bd0a9469d633f` | MIT, © 2026 juicesharp |
| @juicesharp/rpiv-config | https://github.com/juicesharp/rpiv-mono (`packages/rpiv-config`) | 2.12.0 | `7c9bc924c5bfd148f36d7ebc9f7bd0a9469d633f` | MIT, © 2026 juicesharp |
| @narumitw/pi-statusline | https://github.com/narumiruna/pi-extensions (`packages/pi-statusline`) | 0.50.2 | `npm` tarball, sha256 from `nix/locks/pi-statusline.json` | MIT, © 2026 narumiruna |
| @leo-alvarenga/pi-notify | https://github.com/leo-alvarenga/pi-mono (`npm:@leo-alvarenga/pi-notify`) | 0.2.11 | `npm` tarball, sha256 from `nix/locks/pi-notify.json` | MIT, © 2026 Leonardo A. Alvarenga |
| @ff-labs/pi-fff | https://github.com/dmtrKovalenko/fff (`packages/pi-fff`) | 0.11.0 | `npm` tarball, sha256 from `nix/locks/pi-fff.json` | MIT, © 2026 ff-labs |

My own extensions (`extensions/ketch-web-access`, `extensions/decider`,
`extensions/attention-notify`, `extensions/tui`) are written here. Runtime
dependencies they reach for are not vendored:

| Project | Used for | License |
|---|---|---|
| [Mapika/decider](https://github.com/Mapika/decider) | the System One decision service `extensions/decider` talks to. Not vendored and not fetched: the extension is an HTTP client, and the model is your own package to build | Apache-2.0, © Mapika |

The notification chime in `nix/attention-sound.nix` is synthesised by ffmpeg at
build time, so no third-party audio is redistributed here.

All of these are MIT, so redistribution is allowed as long as the copyright
notice and permission notice are kept. Each copy keeps its upstream `LICENSE`
file, and copies of every license are collected under [`licenses/`](./licenses)
by `./nix/collect-licenses.sh`.

`pi-notify`, `pi-statusline` and `pi-fff` are vendored from their published npm tarballs (no source repo checkout) so the built package matches exactly what npm ships.


`rpiv-ask-user-question` and `rpiv-todo` come from the `juicesharp/rpiv-mono`
monorepo; only those two packages plus `rpiv-config` are vendored. Their
dependencies install from npm.

Each vendored package is built and installed by the flake; `nix flake check` runs
the extension tests.

## Derivation sources (not vendored)

`extensions/ketch-web-access` is our own code, but its tool names, parameter
schemas, research-artifact shape, and extension skeleton are adapted from these
MIT-licensed projects. Full license texts are kept next to the code in
`extensions/ketch-web-access/licenses/`, per the MIT terms.

| Project | Used for | License |
|---|---|---|
| [pi-web-access](https://github.com/nicobailon/pi-web-access) | the four tool contracts (`web_search`, `fetch_content`, `get_search_content`, `source_check`) and the deterministic `source_check` artifact | MIT, © 2025 Nico Bailon |
| [pi-ketch](https://github.com/sovorn-c/pi-ketch) | extension skeleton and the pattern of invoking the `ketch` CLI | MIT, © 2026 sovorn-c |
| [ketch](https://github.com/1broseidon/ketch) | the CLI the extension shells out to, and `pkgs.ketch` in nixpkgs | MIT, © 1broseidon |
| [agent-tui](https://github.com/pproenca/agent-tui) | the virtual-terminal CLI the `tui` extension shells out to; the flake packages its prebuilt release binary | MIT, © 2026 Pedro Proenca |
| [camoufox](https://github.com/daijro/camoufox) | the patched Firefox used for the `camoufox` fetch engine | MPL-2.0, © daijro |
| [camoufox-js](https://github.com/apify/camoufox-js) | the playwright-core client that drives camoufox (`packages.camoufox-js`) | MPL-2.0, © Apify / daijro |
| [playwright-core](https://github.com/microsoft/playwright) | automation protocol client pulled in by camoufox-js | Apache-2.0, © Microsoft |
| [pi](https://github.com/earendil-works/pi) | the agent itself; `packages.pi` pins `v1.1.0` | MIT, © earendil-works |
| [pi-flake](https://github.com/ChauDucToan/pi-flake) | declares the `programs.pi-coding-agent` options this flake fills in; `nix/pi.nix` is adapted from its `package.nix` | MIT, © ChauDucToan |

License texts for the programs above are in [`licenses/tools/`](./licenses/tools),
and for the code copied into this repo in [`licenses/vendor/`](./licenses/vendor).
npm dependencies are not collected separately; each stays inside its package's
own install tree with its own LICENSE file.

## Pruned vendor content

`vendor/pi-mcp-adapter` was removed: this setup does not use MCP.

`vendor/rpiv-mono` keeps only `packages/rpiv-ask-user-question`,
`packages/rpiv-todo` and `packages/rpiv-config` (the shared library those two
import). Every other package of the monorepo was deleted.

## Updating a vendored package

```sh
cd vendor/<name>
git clone --depth 1 https://github.com/<owner>/<repo>.git /tmp/<name>-new
rm -rf vendor/<name>
cp -a /tmp/<name>-new vendor/<name>
rm -rf vendor/<name>/.git
```

Then update the version/commit row above.
