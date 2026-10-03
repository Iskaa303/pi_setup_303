#!/usr/bin/env bash
# Print the npmDepsHash values for the extensions that still have lib.fakeHash.
#
#   ./nix/refresh-hashes.sh            # check which ones need pinning
#   ./nix/refresh-hashes.sh pi-subagents rpiv-todo   # build and print hashes
#
# Copy the printed "got:" values into `depsHash` in flake.nix.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
git add -A

if (($# == 0)); then
  grep -B6 'depsHash' flake.nix | grep -oE '^ *[a-z-]+ = \{' | tr -d ' ={' || true
  nix build .#pi-setup --no-link 2>&1 | grep -E "got:|error:" | head -20 || true
  exit 0
fi

for name in "$@"; do
  echo "=== $name"
  nix build ".#$name" --refresh 2>&1 | grep -E "got:|error:" | head -3 || true
done
