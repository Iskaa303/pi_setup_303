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
        in
        pkgs.runCommand "pi-extension-${name}-${version}" { inherit source; } ''
          mkdir -p $out
          cp -a "$source/." $out/
          chmod -R u+w $out
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
      packages = forAllSystems (
        pkgs:
        let
          # nixpkgs already packages ketch; override with programs.pi-setup.ketch
          # if you want a newer upstream build.
          ketch = pkgs.ketch;
          camoufox-js = mkCamoufoxJs pkgs;
          extensions = mkExtensionPkgs pkgs;
        in
        rec {
          inherit ketch camoufox-js;

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
      homeManagerModules.default =
        { config, lib, pkgs, ... }:
        let
          cfg = config.programs.pi-setup;
          own = self.packages.${pkgs.stdenv.hostPlatform.system};
        in
        {
          imports = [ pi-flake.homeManagerModules.default ];

          options.programs.pi-setup = {
            enable = lib.mkEnableOption "pi extensions from pi_setup_303";

            extensions = lib.mkOption {
              type = lib.types.listOf lib.types.str;
              default = map (name: toString own.${name}) extensionNames;
              defaultText = lib.literalExpression "every extension package in this flake";
              description = ''
                Pi package sources written into settings.json. Absolute store
                paths are loaded in place, so nothing is copied into ~/.pi.
                Set it to a subset to install fewer, or add npm:/git: sources
                here to declare those too.
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

            programs.pi-coding-agent = {
              enable = true;
              agentFiles.settings.value = cfg.settings // { packages = cfg.extensions; };
              extraEnv = {
                KETCH_BIN = "${cfg.ketch}/bin/ketch";
              }
              // lib.optionalAttrs cfg.camoufox {
                # The worker resolves camoufox-js from this directory.
                CAMOUFOX_JS = "${own.camoufox-js}/lib/node_modules/camoufox-js-nix/node_modules";
              }
              // lib.optionalAttrs (pkgs.stdenv.hostPlatform.isLinux) {
                # Camoufox's Firefox binary links against libraries NixOS does not
                # put on any default path.
                LD_LIBRARY_PATH = lib.makeLibraryPath (camoufoxLibs pkgs);
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
