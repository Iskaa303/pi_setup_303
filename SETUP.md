# Setup

This repo is a nix flake. Everything installs through it: no npm install, no
Docker, no copying into `~/.pi`.

```nix
# your flake inputs
pi-setup.url = "github:<you>/pi_setup_303";
```

## Home Manager (the way this setup is used)

This flake packages pi itself, so your config needs **only this input** —
pi-flake is used internally for its option definitions, not by you:

```nix
inputs.pi-setup.url = "github:Iskaa303/pi_setup_303";
inputs.pi-setup.inputs.nixpkgs.follows = "nixpkgs";

hm = {
  disabledModules = [ "programs/pi-coding-agent.nix" ];
  imports = [ inputs.pi-setup.homeManagerModules.default ];

  nixpkgs.overlays = [ inputs.pi-setup.overlays.default ];  # optional: pkgs.pi

  programs.pi-setup = {
    enable = true;
    camoufox = true;          # real-Firefox fetch engine

    settings = {              # merged into ~/.pi/agent/settings.json
      defaultModel = "stealth/ox-alpha";
      defaultProvider = "openrouter";
      theme = "dark";
    };
  };
};
```

| Option | Default | Effect |
|---|---|---|
| `programs.pi-setup.enable` | `false` | turn everything below on |
| `programs.pi-setup.pi` | this flake pinned `packages.pi` | the pi binary |
| `programs.pi-setup.extensions` | every extension package | written into `settings.json` as `packages` |
| `programs.pi-setup.settings` | `{}` | the rest of `settings.json` |
| `programs.pi-setup.ketch` | `pkgs.ketch` | added to `home.packages`, `KETCH_BIN` set |
| `programs.pi-setup.camoufox` | `false` | `CAMOUFOX_JS` points at the nix-built client |
| `programs.pi-setup.videoTools` | `true` | ffmpeg + yt-dlp on PATH for transcripts and frames |

`~/.pi/agent/settings.json` becomes a symlink into the store:

- `pi install` / `pi remove` will fail (read-only file). Add or drop
  extensions through `programs.pi-setup.extensions` instead.
- pi bookkeeping that writes settings (e.g. `lastChangelogVersion`) is
  silently skipped; everything else (auth.json, models.json, sessions) is
  untouched.
- npm:/git: sources still work — they are pi-managed and listed in
  `packages` alongside the nix paths.

## Packages

Every extension is a nix package with its npm dependencies baked in:

```sh
nix build .#ketch-web-access        # or .#ponytail, .#pi-subagents, ...
nix build .#pi-setup                # all of them joined
nix build .#camoufox-js            # optional real-Firefox engine client
nix flake check                     # runs ketch-web-access's unit tests
```

## Development

[devenv](https://devenv.sh) drives this repo; `devenv.nix` reuses the packages
from `flake.nix`, so the dev environment and your NixOS config install the same
builds.

```sh
devenv shell                       # ketch, ffmpeg, yt-dlp, gh, camoufox libraries
devenv test                        # ketch-web-access unit tests
devenv package                     # build the extension from this checkout
devenv run link-pi-extension       # copy it into ~/.pi/agent/extensions
```

`nix develop` still exists as a fallback if you have no devenv, but nothing
depends on it.

| Package | Runtime deps it ships |
|---|---|
| `ketch-web-access` | none (peer deps come from pi itself) |
| `ponytail` | none |
| `pi-subagents` | acorn, jiti, undici, yaml |
| `pi-blackhole` | built with tsup during the build (`dist/` is not in the repo) |
| `rpiv-ask-user-question`, `rpiv-todo` | `@juicesharp/rpiv-config`, typebox |
| `pi-notify` | `@leo-alvarenga/pi-ext-core` and its deps |
| `pi-statusline` | `@narumitw/pi-tui-kit` and its deps |

## Camoufox's browser is a cache, not a package

`packages.camoufox-js` provides the *client* (the playwright-core wrapper) from
the nix store. The browser itself is a ~660 MB download that camoufox-js puts in
`$XDG_CACHE_HOME/camoufox`, and it is **not** a nix package — so on an
impermanence setup a reboot deletes it and `fetch_content {engine: "camoufox"}`
quietly falls back to Ketch's Chromium.

Preserve it, beside `.cache/ketch`:

```nix
preservation.preserveAt."/persist".users.<you>.directories = [
  ".cache/ketch"
  ".cache/camoufox"   # ~660MB; re-fetch with: npx camoufox-js fetch
];
```

Until it is preserved, `ketch_browser {action: "status"}` reports "the browser
binary is missing from ~/.cache/camoufox" and suggests `npx camoufox-js fetch`
— deliberately not `npm install camoufox-js`, which would shadow the nix client
with a second, divergent copy.

## Decider weights

`extensions/decider` only speaks HTTP, so the model can live anywhere that
answers the Jev wire protocol. decider's own server is exactly that contract
(`POST /v1/systemone` with `{state, questions}` → `{answers: {...}}`), so it
plugs in unchanged.

Weights come from the Hub as a **whole repo folder**, not a single file — `decider.infer.Decider(path)`
and `decider.serve` read `decider_config.json` and the letter rows from the snapshot, so `fetchurl`-ing
`model.safetensors` does not work. The Hub repo is itself a git repo, so pin the revision in nix:

```nix
# rev: the commit sha shown by `git ls-remote https://huggingface.co/Mapika/decider-2b refs/heads/main`
packages.decider-2b = pkgs.fetchgit {
  url = "https://huggingface.co/Mapika/decider-2b";
  rev = "<40-char sha>";
  hash = "sha256-…";   # nix build .#decider-2b --refresh
};
```

Pick the size that fits the GPU, not the headline number:

|model|bf16 weights|notes|
|---|---|---|
|[decider-0.8b](https://huggingface.co/Mapika/decider-0.8b)|1.4 GB|routing and yes/no, within 1–4 points of the 2B|
|[decider-2b](https://huggingface.co/Mapika/decider-2b)|3.8 GB|the authors' default: routing, classification, judgments, browser agents|
|decider-4b|8.4 GB|does not fit an 8 GB laptop card in bf16|

## Running it

```nix
programs.pi-setup = {
  enable = true;
  decider = true;        # the only thing this needs; everything else is default
};
```

That writes a `decider.service` user unit — `uvicorn decider.serve:app` on
`127.0.0.1:8137` with `DECIDER_MODEL` pointing at the snapshot — and sets
`DECIDER_MODEL=decider-2b` for the extension. Off by default, and turning it off
is complete: no unit, no CUDA packages referenced, and the 3.8 GB snapshot is
never fetched, so the same config works on a laptop with no GPU.

```sh
systemctl --user start decider
curl -s localhost:8137/v1/systemone -H 'content-type: application/json' \
  -d '{"state":"which tool should I use?","questions":{"route":{"type":"choice",
       "criteria":{"web":"needs the network","code":"touches the repo"}}}}'
```

Then `/decider on` in pi and `system_one_decide` answers. `/decider off` keeps the
service loaded but stops the extension using it — the reverse of stopping the
service, which the extension notices as unreachable.

The extension is deliberately decoupled: it is only an HTTP client, so with nothing deployed it
loads no weights, and it now says so plainly instead of pointing at a systemd unit that does not
exist.

The runtime is `torch` (CUDA build) + `transformers>=5` + `flash-linear-attention`, which the
module assembles for you — CUDA torch is unfree, so the flake does its own
`config.allowUnfree = true` nixpkgs import for that one derivation instead of
asking you to allow unfree system-wide.

```bash
python -m decider.serve --model /nix/store/…-decider-2b --port 8137   # or: uvicorn decider.serve:app
```

## Subagents and extensions

Two things make the packages cooperate:

- `settings.json` lists the `~/.pi/agent/extensions/<name>` symlink paths,
  not only store paths. pi resolves both routes to the same real path and loads
  each extension once, but pi-subagents only discovers agents that ship inside
  a package by reading `settings.json` — never the extensions directory.
- `settings.subagents.defaultSubagentOnlyExtensions` is set to the
  `ketch-web-access` path: foreground children do not inherit the parent's
  extensions, so the web tools have to be passed across the hop.

`programs.pi-setup.researcher` is an agent definition written to
`~/.pi/agent/agents/researcher.md`. User agents outrank package agents and
builtins, so it is the `researcher` pi-subagents resolves: a short prompt
instead of a long doctrine, with the depth work left to the model. Set it to
`null` to drop the override.

`programs.pi-setup.subagents` is merged under those defaults.

To wire up a new extension the same way:

1. Add it to `extensionSpecs` in `flake.nix` (with `lock` and `depsHash` if it
   has npm deps; `./nix/pin-hashes.sh <name>` prints them).
2. If it ships `pi.subagents.agents`, nothing else is needed — the symlink plus
   the settings entry is what pi-subagents reads.
3. If its prompts name providers `ketch-web-access` lacks, add an alias to
   `PROVIDER_ALIASES` in the web extension so the value resolves instead of
   being rejected.

## Changing dependencies

Lockfiles live in `nix/locks/`, not in the vendored trees. After editing a
vendored `package.json`:

```sh
# 1. regenerate the lock for that package
cp -a vendor/pi-subagents /tmp/x && (cd /tmp/x && rm -f pnpm-lock.yaml && npm install --package-lock-only)
cp /tmp/x/package-lock.json nix/locks/pi-subagents.json
# 2. npm omits `integrity` for some nested deps; fill those in
./nix/fix-lock-integrity.sh nix/locks/pi-subagents.json
# 3. re-pin the build hashes
./nix/pin-hashes.sh
```

## External tools

| Tool | Needed for | Where it comes from |
|---|---|---|
| `ketch` | all web access | `packages.ketch`, put in `home.packages` |
| `camoufox-js` | `fetch_content {engine: "camoufox"}` | `packages.camoufox-js` + `npx camoufox-js fetch` once |
| `ffmpeg`, `yt-dlp` | video transcripts and frames | `devenv shell`, or add to your config |
| `gh` or `git` | cloning GitHub repos | any |

Camoufox's Firefox binary is a ~660MB download into
`$XDG_CACHE_HOME/camoufox`, done once with `npx camoufox-js fetch`. On NixOS it
also needs the Firefox shared libraries, which the module puts on
`LD_LIBRARY_PATH` for you.

`ketch` is `pkgs.ketch` from nixpkgs (your own overlay shadows it if you
build it); override with `programs.pi-setup.ketch` to pin something else.

## Bumping pi

pi is pinned to `piVersion` in `flake.nix` using upstream prebuilt release
tarballs, so nothing moves on its own:

```sh
$EDITOR flake.nix          # change piVersion, put placeholder hashes in piAssets
nix build .#pi --refresh  # copy the four got: hashes back
```

## Licenses

`licenses/vendor/` holds the licenses of the code copied into this repo,
`licenses/tools/` the ones for the programs called at runtime (pi, ketch,
camoufox, playwright-core). `THIRD-PARTY-NOTICES.md` is the index.

## pi-subagents and ketch-web-access

`researcher` and `evidence-auditor` declare `web_search, fetch_content,
get_search_content, source_check` and refuse to run without them. Foreground
children do **not** inherit the parent's extensions, so if you use those
builtins, add to `~/.pi/agent/settings.json`:

```json
{
  "subagents": {
    "defaultSubagentOnlyExtensions": [
      "/nix/store/<hash>-pi-extension-ketch-web-access-0.0.0/index.ts"
    ]
  }
}
```

```sh
nix eval --raw .#ketch-web-access   # prints the store path to paste
```

## Repository layout

- `flake.nix` — pi, the extension packages, the Home Manager module, checks
- `devenv.nix` — development environment (`devenv shell`, `devenv test`)
- `nix/locks/` — package-lock.json per extension with npm dependencies
- `nix/pi.nix` — the pinned pi build
- `licenses/` — collected license texts (see `THIRD-PARTY-NOTICES.md`)
- `extensions/ketch-web-access/` — my web extension (see its README)
- `vendor/` — upstream copies, each with its own LICENSE
