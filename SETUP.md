# Setup

Two ways to use this folder. Pick one, or mix them.

## A. Install the vendored packages (recommended)

Pi installs a package from a local directory without copying it, and reads each
package's own `pi` manifest. Point at the vendored copies directly:

```sh
pi install /absolute/path/to/pi_setup_303/vendor/ponytail
pi install /absolute/path/to/pi_setup_303/vendor/pi-subagents
```

pi-subagents has runtime dependencies (`acorn`, `jiti`, `undici`, `yaml`). If pi
does not resolve them on install, run:

```sh
cd /absolute/path/to/pi_setup_303/vendor/pi-subagents
npm install
```

Check what landed with `pi list`, and restart pi (or `/reload`).

## B. Copy the personal resources into pi's agent dir

Pi auto-discovers `~/.pi/agent/extensions/*/index.ts` and skills under
`~/.pi/agent/skills/`. So for extensions and skills I write myself:

```sh
cp -r /absolute/path/to/pi_setup_303/extensions/* ~/.pi/agent/extensions/
cp -r /absolute/path/to/pi_setup_303/skills/* ~/.pi/agent/skills/
```

`vendor/` is not copied in this mode — it is the pinned source + attribution
copy. Use mode A for those packages.

## Adding a new extension or skill

```sh
# extension
mkdir -p extensions/my-extension
$EDITOR extensions/my-extension/index.ts

# skill
mkdir -p skills/my-skill
$EDITOR skills/my-skill/SKILL.md
```

## Adding a new vendored package

Copy the upstream repo under `vendor/<name>`, delete its `.git`, keep its
`LICENSE`, and add a row to `THIRD-PARTY-NOTICES.md`. See the commands there.
