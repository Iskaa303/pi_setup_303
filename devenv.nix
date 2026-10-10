# devenv development environment for this repo.
#
#   devenv shell      # enter (ketch, ffmpeg, yt-dlp, camoufox libraries)
#   devenv test       # ketch-web-access unit tests
#   devenv package    # the packaged pi extension, built from this checkout
#
# The pi packages themselves come from this repo's flake, so devenv and a NixOS
# config always install byte-identical extensions.
{ pkgs, lib, ... }:
let
  system = pkgs.stdenv.hostPlatform.system;

  # This repo's own flake: the packages devenv installs and links.
  setup = builtins.getFlake "path:${./.}";
  own = setup.packages.${system};

  camoufoxLibs = setup.lib.camoufoxLibs pkgs;
in
{
  packages = [
    pkgs.nodejs
    pkgs.git
    pkgs.ffmpeg
    pkgs.yt-dlp
    pkgs.gh
    pkgs.cacert
    own.ketch
    own.agent-tui
    own.camoufox-js
  ];

  env = {
    KETCH_BIN = "${own.ketch}/bin/ketch";
    AGENT_TUI_BIN = "${own.agent-tui}/bin/agent-tui";
    CAMOUFOX_JS = "${own.camoufox-js}/lib/node_modules/camoufox-js-nix/node_modules";
    # NixOS has none of the Firefox shared libraries on any default path, and
    # camoufox-bin needs them.
    LD_LIBRARY_PATH = lib.makeLibraryPath camoufoxLibs;
  };

  enterShell = ''
    echo "ketch:       $KETCH_BIN"
    echo "camoufox-js: $CAMOUFOX_JS"
    echo "browser:     npx camoufox-js fetch   # once, ~660MB into $XDG_CACHE_HOME/camoufox"
    echo "tests:       devenv test"
    echo "link into pi: devenv run link-pi-extension"
  '';

  scripts = {
    test.exec = ''
      cd extensions/ketch-web-access
      node --experimental-strip-types --test test/logic.test.ts
    '';

    # Build the extension from this checkout and symlink it into pi's agent
    # directory, so `devenv run link-pi-extension` + `/reload` picks up edits
    # after `devenv package`.
    package.exec = ''
      nix build "path:$PWD#ketch-web-access" --no-link --print-out-paths
    '';

    link-pi-extension.exec = ''
      set -euo pipefail
      target="$HOME/.pi/agent/extensions/ketch-web-access"
      mkdir -p "$(dirname "$target")"
      rm -rf "$target"
      cp -aL "$(nix build "path:$PWD#ketch-web-access" --no-link --print-out-paths)" "$target"
      echo "linked $target — run /reload in pi"
    '';

    pin-hashes.exec = "./nix/pin-hashes.sh";
  };
}
