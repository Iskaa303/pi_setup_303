{
  description = "My pi extensions, each built as a hermetic nix package, plus a Home Manager module to install them";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    pi-flake.url = "github:ChauDucToan/pi-flake";
    pi-flake.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs =
    { self, nixpkgs, pi-flake }:
    let
      lib = nixpkgs.lib;
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = f: lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});

      # pi, pinned. Upstream publishes one prebuilt tarball per system; these
      # hashes are from those releases and never move on their own.
      piVersion = "0.99.1";
      piAssets = {
        "x86_64-linux" = {
          platform = "linux-x64";
          hash = "sha256-yBuaNnuymF+kWiwNTxKxR6zENlVoORClq/k3/iIghCU=";
        };
        "aarch64-linux" = {
          platform = "linux-arm64";
          hash = "sha256-5jKp5VvIZSX/0PcdCRhdYwiD9kuc/IWPcx0e3JJxaVQ=";
        };
        "x86_64-darwin" = {
          platform = "darwin-x64";
          hash = "sha256-mtb8NW9NCLnRDopvkprBukkI3VM1RLqYnFTHO5K1PhM=";
        };
        "aarch64-darwin" = {
          platform = "darwin-arm64";
          hash = "sha256-RpKrodzUghm2HttOzrw8M/YZnr5lKZIo/OW6acMaI6Y=";
        };
      };

      # A pi package is a directory with package.json + pi resources. npm ci runs
      # in buildNpmPackage's dependency phase (its own fixed-output derivation, so
      # the registry is reachable without leaving the sandbox), and the result is
      # flattened to $out because that is what `pi install <path>` loads.
      #
      # `lock` points at a package-lock.json kept in nix/locks/ so vendored sources
      # stay untouched; `postBuild` runs after `pi install` of the repo root for
      # packages that need their own build step.
      mkPiExtension =
        pkgs:
        {
          name,
          src,
          version ? "0.0.0",
          lock ? null,
          depsHash ? null,
          build ? null,
          prune ? true,
          dropDeps ? [ ],
        }:
        let
          # buildNpmPackage installs into $out/lib/node_modules/<name>; `pi
          # install <path>` wants the package files at the root, so the final
          # output is a plain copy of that tree. Packages with no dependencies
          # skip npm entirely.
          deps =
            if lock == null then
              null
            else
              pkgs.buildNpmPackage {
                pname = "pi-extension-${name}-deps";
                inherit version src;
                # `build` runs while devDependencies are still installed.
                dontNpmBuild = build == null;
                npmBuildScript = lib.optionalString (build != null) build;
                # npm pack --dry-run in the install hook would run `prepack`,
                # which these packages cannot run (their tarballs ship no
                # scripts/ directory).
                npmFlags = [ "--ignore-scripts" ];
                # npm prune trips over some lockfiles; these packages have no
                # dev deps to strip anyway.
                dontNpmPrune = !prune;
                postPatch = ''
                  rm -f pnpm-lock.yaml yarn.lock
                  cp ${lock} package-lock.json
                '';
                npmDepsFetcherVersion = 2;
                dontFixup = true;
                npmDepsHash = if depsHash == null then lib.fakeHash else depsHash;
              };
          # npmInstallHook names the install directory after package.json's
          # `name` field, which is scoped for the rpiv packages.
          packageName = (builtins.fromJSON (builtins.readFile (src + "/package.json"))).name;
          source = if deps == null then src else "${deps}/lib/node_modules/${packageName}";
          # pi refuses to load a package that declares pi's own modules as
          # regular dependencies ("duplicate runtime modules"). Move them to
          # peerDependencies and drop the copies from node_modules.
          fixPeerDeps = ''
            package="$out/package.json"
            if [ -f "$package" ]; then
              node --input-type=module -e '
                import { readFileSync, writeFileSync } from "node:fs";
                const file = process.argv[1];
                const host = /^(typebox|@earendil-works\/|pi-)/;
                const pkg = JSON.parse(readFileSync(file, "utf8"));
                const dependencies = pkg.dependencies ?? {};
                const peers = pkg.peerDependencies ?? {};
                let moved = 0;
                for (const [name] of Object.entries(dependencies)) {
                  if (!host.test(name)) continue;
                  delete dependencies[name];
                  peers[name] = "*";
                  moved++;
                }
                if (!moved) process.exit(0);
                pkg.dependencies = dependencies;
                pkg.peerDependencies = peers;
                writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
              ' "$package"
              for name in $(node -e 'const p=require("'"$package"'");console.log(Object.keys(p.peerDependencies??{}).join(" "))'); do
                rm -rf "$out/node_modules/$name"
              done
            fi
            # Dependencies this repo supplies itself, so a second copy must not
            # ship inside the package.
            for name in ${lib.concatStringsSep " " dropDeps}; do
              rm -rf "$out/node_modules/$name"
            done
          '';
        in
        pkgs.runCommand "pi-extension-${name}-${version}" {
          inherit source;
          nativeBuildInputs = [ pkgs.nodejs ];
        } ''
          mkdir -p $out
          cp -a "$source/." $out/
          chmod -R u+w $out
          ${fixPeerDeps}
        '';

      # Every extension in this repo, as a nix package.
      extensionSpecs = {
        ketch-web-access = {
          src = ./extensions/ketch-web-access;
        };
        ponytail = {
          src = ./vendor/ponytail;
        };
        pi-subagents = {
          src = ./vendor/pi-subagents;
          version = "0.71.0";
          lock = ./nix/locks/pi-subagents.json;
          depsHash = "sha256-RNE8Uo8Sd6RR/qc1Te33msrPgT0lvAeBr0AAk5Xy8sM=";
        };
        pi-blackhole = {
          src = ./vendor/pi-blackhole;
          version = "0.5.8";
          lock = ./nix/locks/pi-blackhole.json;
          depsHash = "sha256-BHo2xEz2KI5QeyOwlMOv+hdOT0ROsc37rpunyl1rBWw=";
          build = "build";
        };
        rpiv-ask-user-question = {
          src = ./vendor/rpiv-mono/packages/rpiv-ask-user-question;
          version = "2.11.0";
          lock = ./nix/locks/rpiv-ask-user-question.json;
          depsHash = "sha256-2xRdNztujs12bzWCUF9oP5u5MzwxcPjXDXVg51CCfvI=";
        };
        rpiv-todo = {
          src = ./vendor/rpiv-mono/packages/rpiv-todo;
          version = "2.11.0";
          lock = ./nix/locks/rpiv-todo.json;
          depsHash = "sha256-UCKRcw0hQKSqYK65RF64KladGVC7gmXwQfRbK4qofu8=";
        };
        pi-notify = {
          src = ./vendor/pi-notify;
          version = "0.2.11";
          lock = ./nix/locks/pi-notify.json;
          depsHash = "sha256-neDySBkeTOsPfZEH3pdIQ5WdrB80wDrVQqGl1NppYQQ=";
          prune = false;
        };
        pi-statusline = {
          src = ./vendor/pi-statusline;
          version = "0.50.2";
          lock = ./nix/locks/pi-statusline.json;
          depsHash = "sha256-50LPdwXkFuiatXMP8nxF7j4dd8Yue0hizK7ojAOnwwg=";
          prune = false;
        };
        pi-fff = {
          src = ./vendor/pi-fff;
          version = "0.11.0";
          lock = ./nix/locks/pi-fff.json;
          depsHash = "sha256-OJqIO+m6QMA4eHpAtvgJPXDpcRa6M8nTC4N7HO+Xq1g=";
        };
      };

      # Optional real-Firefox engine for ketch-web-access. The npm package only;
      # the browser itself is fetched at runtime with `npx camoufox-js fetch`
      # (~660MB into XDG_CACHE_HOME/camoufox).
      mkCamoufoxJs = pkgs:
        let
          deps = pkgs.buildNpmPackage {
            pname = "camoufox-js-deps";
            version = "0.12.0";
            src = ./nix/camoufox-js;
            dontNpmBuild = true;
            postPatch = ''
              cp ${./nix/locks/camoufox-js.json} package-lock.json
            '';
            npmDepsFetcherVersion = 2;
            dontFixup = true;
            npmDepsHash = "sha256-1s3lp3rGx8TSt1xbiMsreYJMJrCJ8XGNGZOhgCno3C4=";
          };
        in
        pkgs.runCommand "camoufox-js-0.12.0" { } ''
          mkdir -p $out/lib/node_modules
          cp -a ${deps}/lib/node_modules/. $out/lib/node_modules/
          chmod -R u+w $out
        '';

      extensionNames = builtins.attrNames extensionSpecs;
      mkExtensionPkgs = pkgs: lib.mapAttrs (name: spec: mkPiExtension pkgs (spec // { inherit name; })) extensionSpecs;

      # Camoufox's Firefox fork needs the ordinary Firefox shared libraries.
      # NixOS ships none of them, so the dev shell puts them on LD_LIBRARY_PATH.
      camoufoxLibs = pkgs: with pkgs; [
        alsa-lib
        at-spi2-atk
        at-spi2-core
        cairo
        cups
        dbus
        glib
        gtk3
        libgcrypt
        libglvnd
        libx11
        libxcb
        libxcomposite
        libxdamage
        libxext
        libxfixes
        libxkbcommon
        libxrandr
        libxshmfence
        libxt
        nspr
        nss
        pango
      ];
    in
    {
      # pi itself, pinned to one version: upstream's prebuilt release tarballs.
      # Nothing here moves when your lock is updated — bumping pi is a deliberate
      # edit of piVersion + piAssets.
      lib.piVersion = piVersion;

      overlays.default = final: _prev: {
        pi = final.callPackage ./nix/pi.nix {
          version = piVersion;
          assets = piAssets;
        };
        pi-coding-agent = final.pi;
      };

      packages = forAllSystems (
        pkgs:
        let
          ketch = pkgs.ketch;
          camoufox-js = mkCamoufoxJs pkgs;
          extensions = mkExtensionPkgs pkgs;
          pi = pkgs.callPackage ./nix/pi.nix {
            version = piVersion;
            assets = piAssets;
          };
        in
        rec {
          inherit ketch camoufox-js pi;

          # All extensions in one output, for inspection or `pi install`.
          pi-setup = pkgs.symlinkJoin {
            name = "pi-setup";
            paths = builtins.attrValues extensions;
          };
        } // extensions
      );

      # Import this from a Home Manager config that already uses pi-flake; it
      # fills in programs.pi-coding-agent: this repo's extensions in a nix-owned
      # settings.json, ketch on PATH, and the env the web extension needs.
      #
      # Extensions are not installed with `pi install`. They are declared in
      # settings.json (which this module owns), so a rebuild swaps the package
      # list atomically instead of appending to it on every activation.
      # Requires pi-flake's Home Manager module to be imported (it declares
      # programs.pi-coding-agent). This module deliberately does NOT import
      # pi-flake itself: doing so would pull a second, independent copy of that
      # flake into your lock and duplicate every option it declares.
      homeManagerModules.default =
        { config, lib, pkgs, ... }:
        let
          cfg = config.programs.pi-setup;
          own = self.packages.${pkgs.stdenv.hostPlatform.system};

          # pi-subagents needs the web tools passed explicitly: foreground
          # children do not inherit the parent's extensions.
          webExtension = "${own.ketch-web-access}";
          webSubagents = { subagentOnlyExtensions = [ webExtension ]; };

          # Merged under whatever the user put in programs.pi-setup.subagents.
          subagentsSettings = {
            defaultSubagentOnlyExtensions = [ webExtension ];
            agentOverrides = {
              researcher = webSubagents;
              evidence-auditor = webSubagents;
            };
          } // cfg.subagents;
        in
        {
          # pi-flake supplies the programs.pi-coding-agent option surface; this
          # module fills it in and pins the pi binary. Import it here so your
          # config only needs this one module.
          imports = [ pi-flake.homeManagerModules.default ];

          options.programs.pi-setup = {
            enable = lib.mkEnableOption "pi extensions from pi_setup_303";

            pi = lib.mkOption {
              type = lib.types.package;
              default = pkgs.pi;
              defaultText = lib.literalExpression "the pinned pi in this flake";
              description = "The pi binary. Pinned here so a lock update cannot move it.";
            };

            extensions = lib.mkOption {
              type = lib.types.listOf lib.types.str;
              default = lib.optionalAttrs cfg.linkExtensions (
                # pi-subagents only discovers package-provided agents from
                # settings.json packages or npm dirs, never from
                # ~/.pi/agent/extensions. Listing the symlink paths here makes
                # pi-subagents see agents that ship inside a package. pi
                # resolves both routes to the same real path and loads the
                # extension once.
                map (name: "${config.home.homeDirectory}/.pi/agent/extensions/${name}") extensionNames
              );
              defaultText = lib.literalExpression ''"the symlinked extension paths"'';
              description = ''
                Pi package sources written into settings.json. Defaults to the
                symlinked paths under ~/.pi/agent/extensions, which is what
                makes pi-subagents aware of agents that ship inside a package.
                Add npm:/git: sources here for anything else.
              '';
            };

            subagents = lib.mkOption {
              type = lib.types.attrs;
              default = { };
              example = lib.literalExpression ''
                {
                  defaultModel = "stealth/space-bunny-alpha";
                }
              '';
              description = ''
                Merged into settings.json under `subagents`. The module fills in
                what pi-subagents needs to work with the packages here —
                foreground children do not inherit extensions, so
                ketch-web-access is passed explicitly to every subagent, and to
                the researcher/evidence-auditor builtins that require its tools.
              '';
            };

            researcher = lib.mkOption {
              type = lib.types.nullOr lib.types.lines;
              default = builtins.readFile ./nix/agents/researcher.md;
              description = ''
                Agent definition written to ~/.pi/agent/agents/researcher.md.
                User agents outrank package agents and builtins, so this is the
                researcher pi-subagents resolves. Set to null to keep whichever
                one the installed packages ship.
              '';
            };

            linkExtensions = lib.mkOption {
              type = lib.types.bool;
              default = true;
              description = ''
                Symlink every extension package into
                ~/.pi/agent/extensions/<name> instead of listing store paths in
                settings.json. Same content either way; symlinks are readable
                in pi's startup output and in error messages.
              '';
            };

            settings = lib.mkOption {
              type = lib.types.attrs;
              default = { };
              example = lib.literalExpression ''
                {
                  defaultModel = "stealth/ox-alpha";
                  defaultProvider = "openrouter";
                  theme = "dark";
                }
              '';
              description = ''
                Extra contents for ~/.pi/agent/settings.json, merged under the
                package list. Only `packages` is managed by this module; put
                model, theme and shell settings here.
              '';
            };

            ketch = lib.mkOption {
              type = lib.types.package;
              default = pkgs.ketch;
              defaultText = lib.literalExpression "pkgs.ketch";
              description = "The ketch CLI that ketch-web-access shells out to.";
            };

            camoufox = lib.mkOption {
              type = lib.types.bool;
              default = false;
              description = ''
                Make the Camoufox client available to ketch-web-access
                (fetch_content engine "camoufox"). The browser itself is a
                separate one-off download: npx camoufox-js fetch.
              '';
            };
          };

          config = lib.mkIf cfg.enable {
            home.packages = [ cfg.ketch ];

            # ~/.pi/agent/extensions/<name> -> /nix/store/... so pi finds each
            # extension by its real name instead of a store hash.
            home.file =
              lib.optionalAttrs cfg.linkExtensions (
                lib.listToAttrs (
                  map (name: {
                    name = ".pi/agent/extensions/${name}";
                    value = { source = "${own.${name}}"; };
                  }) extensionNames
                )
              )
              // lib.optionalAttrs (cfg.researcher != null) {
                # user agents outrank package agents and builtins
                ".pi/agent/agents/researcher.md".text = cfg.researcher;
              };


            programs.pi-coding-agent = {
              enable = true;
              package = cfg.pi;
              agentFiles.settings.value = cfg.settings // {
                packages = cfg.extensions;
                subagents = subagentsSettings;
              };
              extraEnv = {
                KETCH_BIN = "${cfg.ketch}/bin/ketch";
              }
              // lib.optionalAttrs cfg.camoufox {
                # The worker resolves camoufox-js from this directory.
                CAMOUFOX_JS = "${own.camoufox-js}/lib/node_modules/camoufox-js-nix/node_modules";
              }
              // lib.optionalAttrs (pkgs.stdenv.hostPlatform.isLinux) {
                # Camoufox's Firefox binary links against libraries NixOS does not
                # put on any default path. cc.lib is included because pi's own
                # wrapper prefixes it, and extraEnv replaces (not appends) to it.
                LD_LIBRARY_PATH = lib.makeLibraryPath (camoufoxLibs pkgs ++ [ pkgs.stdenv.cc.cc.lib ]);
              };
            };
          };
        };

      checks = forAllSystems (
        pkgs:
        {
          # Pure-logic tests: no npm, no network.
          ketch-web-access-tests = pkgs.runCommand "ketch-web-access-tests" { nativeBuildInputs = [ pkgs.nodejs ]; } ''
            cp -r ${./extensions/ketch-web-access} src
            chmod -R u+w src
            cd src
            node --experimental-strip-types --test test/logic.test.ts
            touch $out
          '';
        }
      );

      devShells = forAllSystems (
        pkgs:
        let
          own = self.packages.${pkgs.stdenv.hostPlatform.system};
        in
        {
          # Development lives in devenv.nix (`devenv shell`); this is only a
          # fallback for people without devenv installed.
          default = pkgs.mkShell {
            name = "pi-setup";
            packages = [
              pkgs.nodejs
              pkgs.git
              pkgs.ffmpeg
              pkgs.yt-dlp
              pkgs.gh
              pkgs.cacert
              own.ketch
              own.ketch-web-access
            ];
            LD_LIBRARY_PATH = lib.makeLibraryPath (camoufoxLibs pkgs);
          };
        }
      );

      # Shared with devenv.nix so the camoufox library list lives in one place.
      lib.camoufoxLibs = camoufoxLibs;
    };
}
