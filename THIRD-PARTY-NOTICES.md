# Third-party notices

The packages under `vendor/` are unmodified copies of upstream repositories,
vendored so this setup is reproducible and so the original authors keep
attribution. Each copy keeps its upstream `LICENSE` file in place.

| Package | Upstream | Version | Commit | License |
|---|---|---|---|---|
| ponytail | https://github.com/DietrichGebert/ponytail | 4.10.0 | `e3ba2aa6f1e6f0bc4d69eb09c9f0d0a93af56156` | MIT, © 2026 DietrichGebert |
| pi-subagents | https://github.com/nicobailon/pi-subagents | 0.71.0 | `2e9c51bada2da6a9ba73b6973e1545a9afa0d057` | MIT, © 2026 Nico Bailon |

Both are MIT licensed, so redistribution is allowed as long as the copyright
notice and permission notice are kept. They are: see
`vendor/ponytail/LICENSE` and `vendor/pi-subagents/LICENSE`.

## Updating a vendored package

```sh
cd vendor/<name>
git clone --depth 1 https://github.com/<owner>/<repo>.git /tmp/<name>-new
rm -rf vendor/<name>
cp -a /tmp/<name>-new vendor/<name>
rm -rf vendor/<name>/.git
```

Then update the version/commit row above.
