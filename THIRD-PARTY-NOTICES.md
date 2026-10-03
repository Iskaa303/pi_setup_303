# Third-party notices

The packages under `vendor/` are unmodified copies of upstream repositories,
vendored so this setup is reproducible and so the original authors keep
attribution. Each copy keeps its upstream `LICENSE` file in place.

| Package | Upstream | Version | Commit | License |
|---|---|---|---|---|
| ponytail | https://github.com/DietrichGebert/ponytail | 4.10.0 | `e3ba2aa6f1e6f0bc4d69eb09c9f0d0a93af56156` | MIT, © 2026 DietrichGebert |
| pi-subagents | https://github.com/nicobailon/pi-subagents | 0.71.0 | `2e9c51bada2da6a9ba73b6973e1545a9afa0d057` | MIT, © 2026 Nico Bailon |
| pi-blackhole | https://github.com/k0valik/pi-blackhole | 0.5.8 | `25d7c1a5894bf50fd8f61e801cfa0aba2900989a` | MIT, © 2026 k0valik |
| @juicesharp/rpiv-ask-user-question | https://github.com/juicesharp/rpiv-mono (`packages/rpiv-ask-user-question`) | 2.11.0 | `d74b1c99830a565f3df3f37e0a36616d17ffc574` | MIT, © 2026 juicesharp |
| @juicesharp/rpiv-todo | https://github.com/juicesharp/rpiv-mono (`packages/rpiv-todo`) | 2.11.0 | `d74b1c99830a565f3df3f37e0a36616d17ffc574` | MIT, © 2026 juicesharp |
| @juicesharp/rpiv-config | https://github.com/juicesharp/rpiv-mono (`packages/rpiv-config`) | 2.11.0 | `d74b1c99830a565f3df3f37e0a36616d17ffc574` | MIT, © 2026 juicesharp |

Both are MIT licensed, so redistribution is allowed as long as the copyright
notice and permission notice are kept. They are: see the `LICENSE` file inside
each `vendor/` directory.

`rpiv-ask-user-question` and `rpiv-todo` come from the `juicesharp/rpiv-mono`
monorepo; only those two packages plus `rpiv-config` are vendored. Their
dependencies install from npm.

Unverified: none of these vendored copies has been build- or install-tested
through `pi install` (the Nix/Docker/bare-host installers do install them).

## Derivation sources (not vendored)

`extensions/ketch-web-access` is our own code, but its tool names, parameter
schemas, research-artifact shape, and extension skeleton are adapted from these
MIT-licensed projects. Full license texts are kept next to the code in
`extensions/ketch-web-access/licenses/`, per the MIT terms.

| Project | Used for | License |
|---|---|---|
| [pi-web-access](https://github.com/nicobailon/pi-web-access) | the four tool contracts (`web_search`, `fetch_content`, `get_search_content`, `source_check`) and the deterministic `source_check` artifact | MIT, © 2025 Nico Bailon |
| [pi-ketch](https://github.com/sovorn-c/pi-ketch) | extension skeleton and the pattern of invoking the `ketch` CLI | MIT, © 2026 sovorn-c |
| [ketch](https://github.com/1broseidon/ketch) | the CLI the extension shells out to (a runtime dependency, not copied) | MIT, © 1broseidon |
| [camoufox-js](https://github.com/apify/camoufox-js) | optional real-Firefox fetch engine; installed as an npm dependency, browser fetched with `npx camoufox-js fetch` | MIT, © 2024 daijro / Apify |

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
