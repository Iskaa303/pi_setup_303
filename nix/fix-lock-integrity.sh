#!/usr/bin/env bash
# Repair a generated package-lock.json: npm sometimes omits `integrity` for
# nested dev dependencies of scoped packages, and `npm ci` (which nix runs in
# the dependency phase) then dies with "non-git dependencies should have
# associated integrity". This fills those in from the registry.
#
#   ./nix/fix-lock-integrity.sh nix/locks/pi-blackhole.json
set -euo pipefail
lock="$1"

node - "$lock" <<'EOF'
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");

const path = process.argv[2];
const lock = JSON.parse(fs.readFileSync(path, "utf8"));

for (const [key, entry] of Object.entries(lock.packages)) {
  if (!key || entry.link || entry.integrity || !entry.resolved) continue;
  const name = key.slice(key.lastIndexOf("node_modules/") + "node_modules/".length);
  const integrity = execFileSync("npm", ["view", `${name}@${entry.version}`, "dist.integrity"], {
    encoding: "utf8",
  }).trim();
  entry.integrity = integrity;
  console.log(`${name}@${entry.version} ${integrity}`);
}

fs.writeFileSync(path, `${JSON.stringify(lock, null, 2)}\n`);
EOF
