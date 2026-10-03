# pi, pinned to one version.
#
# Upstream (earendil-works/pi) publishes a prebuilt tarball per platform, so
# this is a download plus a wrapper — no build, no toolchain drift. The version
# and the per-platform hashes come from flake.nix (piVersion / piAssets).
#
# To bump pi: change piVersion in flake.nix, put placeholders in piAssets, run
#   nix build path:.#pi --refresh
# and copy the four "got:" values back.
#
# Adapted from pi-flake (MIT, © ChauDucToan), which packages pi the same way.
{
  lib,
  stdenv,
  stdenvNoCC,
  makeWrapper,
  fetchurl,
  gitMinimal,
  nodejs,
  version,
  assets,
}:

let
  asset = assets.${stdenv.hostPlatform.system};
in

stdenvNoCC.mkDerivation {
  pname = "pi-coding-agent";
  inherit version;

  src = fetchurl {
    url = "https://github.com/earendil-works/pi/releases/download/v${version}/pi-${asset.platform}.tar.gz";
    hash = asset.hash;
  };

  nativeBuildInputs = [ makeWrapper ];

  dontConfigure = true;
  dontBuild = true;

  installPhase = ''
    runHook preInstall

    mkdir -p $out/lib/pi $out/bin
    cp -r . $out/lib/pi/
    chmod +x $out/lib/pi/pi

    makeWrapper $out/lib/pi/pi $out/bin/pi \
      --set-default PI_DATA_DIR "$HOME/.local/share/pi" \
      --set-default PI_PACKAGE_DIR "$out/lib/pi" \
      --prefix PATH : ${lib.makeBinPath [ nodejs gitMinimal ]}

    runHook postInstall
  '';

  postFixup = lib.optionalString stdenv.hostPlatform.isLinux ''
    wrapProgram $out/bin/pi \
      --prefix LD_LIBRARY_PATH : ${lib.makeLibraryPath [ stdenv.cc.cc.lib ]}
  '';

  meta = {
    description = "Terminal-based AI coding agent (pre-built, version pinned by pi_setup_303)";
    homepage = "https://github.com/earendil-works/pi";
    license = lib.licenses.mit;
    mainProgram = "pi";
    platforms = lib.platforms.unix;
  };
}
