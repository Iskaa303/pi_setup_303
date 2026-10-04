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
| `pi-fff` | `@ff-labs/fff-node`, `@ff-labs/fff-bun` |

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
