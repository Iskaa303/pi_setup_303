# Third-party notices

The packages under `vendor/` are unmodified copies of upstream repositories,
vendored so this setup is reproducible and so the original authors keep
attribution. Each copy keeps its upstream `LICENSE` file in place.

| Package | Upstream | Version | Commit | License |
|---|---|---|---|---|
| ponytail | https://github.com/DietrichGebert/ponytail | 4.10.0 | `e3ba2aa6f1e6f0bc4d69eb09c9f0d0a93af56156` | MIT, © 2026 DietrichGebert |
| pi-subagents | https://github.com/nicobailon/pi-subagents | 0.71.0 | `2e9c51bada2da6a9ba73b6973e1545a9afa0d057` | MIT, © 2026 Nico Bailon |
| pi-blackhole | https://github.com/k0valik/pi-blackhole | 0.5.8 | `25d7c1a5894bf50fd8f61e801cfa0aba2900989a` | MIT, © 2026 k0valik |
| @juicesharp/rpiv-ask-user-question | https://github.com/juicesharp/rpiv-mono (`packages/rpiv-ask-user-question`) | 2.11.0 | `d74b1c99830a565f3df3f37e0a36616d17ffc574` | MIT, © 2026 juicesharp |
| @juicesharp/rpiv-todo | https://github.com/juicesharp/rpiv-mono (`packages/rpiv-todo`) | 2.11.0 | `d74b1c99830a565f3df3f37e0a36616d17ffc574` | MIT, © 2026 juicesharp |

Both are MIT licensed, so redistribution is allowed as long as the copyright
notice and permission notice are kept. They are: see the `LICENSE` file inside
each `vendor/` directory.

`rpiv-ask-user-question` and `rpiv-todo` live in the `juicesharp/rpiv-mono`
monorepo and share workspace packages with their siblings, so the whole
monorepo is vendored once as `vendor/rpiv-mono` rather than as two partial
copies that would not resolve. Install the two packages from
`vendor/rpiv-mono/packages/`.

Unverified: none of these vendored copies has been build- or install-tested
yet (pi-blackhole in particular needs its `dist/` built for git installs).

## Updating a vendored package

```sh
cd vendor/<name>
git clone --depth 1 https://github.com/<owner>/<repo>.git /tmp/<name>-new
rm -rf vendor/<name>
cp -a /tmp/<name>-new vendor/<name>
rm -rf vendor/<name>/.git
```

Then update the version/commit row above.
