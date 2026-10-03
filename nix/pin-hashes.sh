#!/usr/bin/env bash
# Fill in (or refresh) the `depsHash` of every extension package in flake.nix.
#
#   ./nix/pin-hashes.sh
#
# Builds each package once with a placeholder hash, reads back the "got:" value
# the fixed-output dependency phase reports, and writes it into extensionSpecs.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

for lock in nix/locks/*.json; do
  name="$(basename "$lock" .json)"
  git add -A
  log=$(mktemp)
  # Drop only this package's hash, so the dependency phase reports its real one.
  DEP_NAME="$name" node -e '
    const fs = require("node:fs");
    const name = process.env.DEP_NAME;
    const lines = fs.readFileSync("flake.nix", "utf8").split("\n");
    const start = lines.findIndex((l) => l.trim() === name + " = {");
    for (let i = start + 1; i < lines.length; i++) {
      if (lines[i].trim() === "};") break;
      if (lines[i].includes("depsHash = ")) lines.splice(i, 1);
    }
    fs.writeFileSync("flake.nix", lines.join("\n"));
  '
  nix build ".#$name" --refresh >"$log" 2>&1 || true
  # awk exits only after the whole log, so no SIGPIPE under `set -o pipefail`.
  hash=$(awk '/got:/ { for (i = 1; i <= NF; i++) if ($i ~ /^sha256-/) { print $i; exit } }' "$log")
  rm -f "$log"
  if [[ -z "$hash" ]]; then
    echo "!! $name: no hash reported (build failed?)" >&2
    continue
  fi
  DEP_NAME="$name" DEP_HASH="$hash" node -e '
    const fs = require("node:fs");
    const [name, hash] = [process.env.DEP_NAME, process.env.DEP_HASH];
    const lines = fs.readFileSync("flake.nix", "utf8").split("\n");
    const start = lines.findIndex((l) => l.trim() === name + " = {");
    const lock = lines.findIndex((l, i) => i > start && l.includes("lock = ./nix/locks/"));
    lines.splice(lock + 1, 0, `          depsHash = "${hash}";`);
    fs.writeFileSync("flake.nix", lines.join("\n"));
  '
  git add flake.nix
  echo "$name -> $hash"
done
