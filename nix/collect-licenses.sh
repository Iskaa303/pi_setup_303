#!/usr/bin/env bash
# Collect the LICENSE of every package this repo ships or depends on into
# licenses/, so attribution travels with the repo.
#
#   ./nix/collect-licenses.sh
#
# Layout:
#   licenses/vendor/      code copied into this repo (vendor/*, extensions/*)
#   licenses/tools/       programs this setup calls at runtime (pi, ketch, …)
#   licenses/npm/         npm dependencies pulled in by the packages above
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
rm -rf licenses
mkdir -p licenses/vendor licenses/tools licenses/npm

copy() {
  local from="$1" to="$2"
  if [[ -f "$from" ]]; then
    cp "$from" "$to"
    echo "  $(basename "$to")"
  else
    echo "  MISSING: $from" >&2
  fi
}

echo "vendor:"
for dir in \
  vendor/ponytail \
  vendor/pi-subagents \
  vendor/pi-blackhole \
  vendor/pi-notify \
  vendor/pi-statusline \
  vendor/rpiv-mono/packages/rpiv-ask-user-question \
  vendor/rpiv-mono/packages/rpiv-todo
do
  name="$(basename "$dir")"
  copy "$dir/LICENSE" "licenses/vendor/${name}.LICENSE"
done

# pi-web-access / pi-ketch: the sources ketch-web-access is derived from.
for f in extensions/ketch-web-access/licenses/*.LICENSE; do
  [[ -e "$f" ]] && copy "$f" "licenses/vendor/$(basename "$f")"
done

echo "tools:"
# pi itself and pi-flake are fetched from upstream releases at build time.
for spec in \
  "pi=https://raw.githubusercontent.com/earendil-works/pi/main/LICENSE" \
  "pi-flake=https://raw.githubusercontent.com/ChauDucToan/pi-flake/main/LICENSE" \
  "ketch=https://raw.githubusercontent.com/1broseidon/ketch/main/LICENSE" \
  "camoufox=https://raw.githubusercontent.com/daijro/camoufox/main/LICENSE" \
  "playwright-core=https://raw.githubusercontent.com/microsoft/playwright/main/LICENSE"
do
  name="${spec%%=*}"
  url="${spec#*=}"
  curl -fsSL "$url" -o "licenses/tools/${name}.LICENSE" && echo "  ${name}.LICENSE" || echo "  MISSING: $url" >&2
done

# camoufox-js is MPL-2.0 and publishes no LICENSE file on GitHub, so its text is
# taken from the npm tarball instead (see below).
echo "npm (direct dependencies of the packaged extensions):"
collect_npm() {
  local dir="$1"
  local out="$2"
  [[ -d "$dir/node_modules" ]] || return 0
  for dep in "$dir"/node_modules/*/; do
    [[ -d "$dep" ]] || continue
    local pkg="$dep/package.json"
    [[ -f "$pkg" ]] || continue
    local name version
    name="$(basename "$(dirname "$dep")")"
    name="$(node -p "require('$pkg').name")"
    version="$(node -p "require('$pkg').version")"
    local file=""
    for candidate in LICENSE LICENSE.md LICENSE.txt LICENCE MIT; do
      if [[ -f "$dep/$candidate" ]]; then
        file="$candidate"
        break
      fi
    done
    if [[ -n "${file:-}" ]]; then
      cp "$dep/$file" "licenses/npm/${name//\//_}-${version}.LICENSE" && echo "  ${name}@${version}"
    else
      echo "  ${name}@${version}: no LICENSE file in the tarball"
    fi
  done
}

for spec in pi-notify pi-statusline camoufox-js; do
  case "$spec" in
    camoufox-js)
      path="$(nix build .#camoufox-js --no-link --print-out-paths 2>/dev/null | tail -1)/lib/node_modules/camoufox-js-nix/node_modules"
      collect_npm "$path" licenses/npm
      ;;
    *)
      path="$(nix build ".#$spec" --no-link --print-out-paths 2>/dev/null | tail -1)"
      collect_npm "$path" licenses/npm
      ;;
  esac
done

echo "done: $(find licenses -type f | wc -l) files"
