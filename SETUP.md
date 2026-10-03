# Setup

This repo is a nix flake. Everything installs through it: no npm install, no
Docker, no copying into `~/.pi`.

```nix
# your flake inputs
pi-setup.url = "github:<you>/pi_setup_303";
```

## Home Manager (the way this setup is used)

`pi_setup_303` builds on [pi-flake](https://github.com/ChauDucToan/pi-flake), so
you keep using pi-flake as your base and this flake only adds the extensions:

```nix
{ inputs, pkgs, username, ... }: {
  nixpkgs.overlays = [ inputs.pi-flake.overlays.default ];

  hm = {
    disabledModules = [ "programs/pi-coding-agent.nix" ];
    imports = [
      inputs.pi-flake.homeManagerModules.default   # pi itself, your config
      inputs.pi-setup.homeManagerModules.default    # this repo's extensions
    ];

    programs.pi-coding-agent = {
      enable = true;
      # your existing extraEnv, statusline, shazam compat, trust.json, ...
    };
  };
}
```

The module from this flake fills in `programs.pi-coding-agent` for you:

| Option | Default | Effect |
|---|---|---|
| `programs.pi-setup.enable` | `false` | turn everything below on |
| `programs.pi-setup.extensions` | every extension in this repo | `pi install <store path>` at activation |
| `programs.pi-setup.ketch` | this flake's `packages.ketch` | added to `home.packages`, `KETCH_BIN` set |
| `programs.pi-setup.camoufox` | `false` | `CAMOUFOX_JS` points at the nix-built client |

Leave `programs.pi-coding-agent.extensions` alone unless you want to add or drop
individual extensions:

```nix
programs.pi-setup.extensions = [
  (toString inputs.pi-setup.packages.${pkgs.stdenv.hostPlatform.system}.ketch-web-access)
  # everything else stays at the default: use
  # inputs.pi-setup.packages.${pkgs.stdenv.hostPlatform.system}.<name>
];
```

On NixOS (system-wide) instead of Home Manager, use `services.pi-coding-agent`
from pi-flake and point `extensions` at the same store paths.

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

`ketch` itself is `pkgs.ketch` from nixpkgs; override it with
`programs.pi-setup.ketch = pkgs.callPackage ...` if you want a newer upstream
build.

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

- `flake.nix` — packages, Home Manager module, checks
- `devenv.nix` — development environment (`devenv shell`, `devenv test`)
- `nix/locks/` — package-lock.json per extension with npm dependencies
- `extensions/ketch-web-access/` — my web extension (see its README)
- `vendor/` — trimmed upstream copies, each with its own LICENSE
