# ketch-web-access

A Ketch-backed replacement for [pi-web-access](https://github.com/nicobailon/pi-web-access),
built so that **no API key is ever required**. Search, scraping, Markdown
extraction and browser rendering all run through local or key-free services:

| Concern | Backed by | Key needed |
|---|---|---|
| Search | `ketch search` with `ddg` (DuckDuckGo) or a self-hosted `searxng` | no |
| Page fetch | `ketch scrape` (HTTP + readability) | no |
| JS rendering | Ketch's bundled headless Chromium, or **Camoufox** — a real patched Firefox | no |
| Markdown | `ketch extract` | no |
| GitHub repos | `gh repo clone` / `git clone --depth 1` | no (uses your existing auth) |
| Video | `yt-dlp` transcripts + `ffmpeg` frames, answered by the current Pi model | no |

Ketch's other backends (brave, exa, firecrawl, keenable) still work if you happen
to have keys; nothing here depends on them.

## Tools

Drop-in compatible with pi-web-access, so [pi-subagents](https://github.com/nicobailon/pi-subagents)
builtins keep working:

| Tool | What it does |
|---|---|
| `web_search` | `ketch search` — single query, `queries[]` batch, or `--multi` federation |
| `fetch_content` | pages, raw HTML, `mode: browser`, `engine: camoufox`, GitHub clone, video |
| `get_search_content` | in-memory store, paged by `responseId`, plus `findText` |
| `source_check` | `ketch search` + `ketch scrape` → deterministic citation artifact |

Plus three surfaces pi-ketch does not expose:

| Tool | What it does |
|---|---|
| `ketch_extract` | `ketch extract` — raw HTML → Markdown, no fetching |
| `ketch_doctor` | `ketch doctor --json` — which backend/renderer/cache is broken |
| `ketch_browser` | renderer status/install for both Chromium (`engine: ketch`) and Camoufox |

## Engines

`fetch_content` takes an `engine`:

- `ketch` (default) — HTTP first, bundled headless Chromium when a page looks
  like a JavaScript shell. Fast, cheap, no extra install.
- `camoufox` — a real Firefox fork with C++-level fingerprint patching, driven
  through `playwright-core`. Use it for bot walls, fingerprint-sensitive sites,
  and pages that render only after a delay.
- `auto` — `ketch`, then Camoufox whenever Ketch returns an error or almost no
  content.

Camoufox HTML is converted to Markdown with `ketch extract`, so both engines
return the same shape.

```sh
cd extensions/ketch-web-access
npm install camoufox-js     # installs playwright-core
npx camoufox-js fetch       # downloads the ~660MB browser into ~/.cache/camoufox
```

With nix you do not need either step: `packages.camoufox-js` provides the client
and the module sets `CAMOUFOX_JS` (enable `programs.pi-setup.camoufox`). Only
the browser download stays manual.

On NixOS the browser needs the ordinary Firefox shared libraries, which are not
in a default system closure. `devenv shell` and the Home Manager module both put
them on `LD_LIBRARY_PATH`.

## Requirements

- `ketch` on `PATH`, or `KETCH_BIN` pointing at it.
- Optional: `camoufox-js` + its browser (real-Firefox engine), `gh`/`git`
  (repo cloning), `yt-dlp` and `ffmpeg` (videos).

## Using it with pi-subagents

`researcher` and `evidence-auditor` declare `web_search, fetch_content, get_search_content, source_check`
and refuse to run if a required tool is missing. Foreground children do **not**
inherit the parent's extensions, so the child has to load this one explicitly.
Add to `~/.pi/agent/settings.json`:

```json
{
  "subagents": {
    "agentOverrides": {
      "researcher": {
        "subagentOnlyExtensions": ["/absolute/path/to/extensions/ketch-web-access/index.ts"]
      },
      "evidence-auditor": {
        "subagentOnlyExtensions": ["/absolute/path/to/extensions/ketch-web-access/index.ts"]
      }
    }
  }
}
```

Use `subagents.defaultSubagentOnlyExtensions` to apply it to every agent instead.
Background children pick the extension up through normal Pi discovery.

## Behaviour notes / gaps

- `source_check` is deterministic, exactly like pi-web-access's. It returns
  `unclear` with cited, hashed passages and never claims semantic support — the
  agent is expected to read the passages.
- `recencyFilter` and `proxy` are accepted for schema compatibility but do not
  filter or route anything: Ketch has no server-side recency filter and reads its
  proxy from its own config. `domainFilter` is applied client-side.
- `workflow: "summary-review" | "auto-summary"` is accepted but not implemented
  (pi-web-access's browser curator is not part of this extension).
- Video support is transcript + frames, not a separate vision model: the current
  Pi model answers the `prompt` from the transcript and any extracted frames.
- Browser-cookie auth (`auth`) is accepted but ignored; use Ketch's cookie-file
  config instead.
- The response store is in-memory and capped at 40 entries; `responseId`s do not
  survive a process restart.
- Deliberately absent, because they need keys or a server: MCP mode, and the
  hosted provider zoo (Tavily, Jina, Perplexity, Gemini, …).

## Tests

```sh
npm test    # node --experimental-strip-types --test test/logic.test.ts
```

Covers the pure logic: query normalisation, domain filtering, passage
extraction with offsets, `findText` modes, artifact construction, and the
GitHub/video URL detection that decides which fetch path a URL takes.
`nix flake check` runs the same tests in a sandbox.

## Attribution

Adapted from MIT-licensed work; full license texts in [`licenses/`](./licenses):

- **pi-web-access** © 2025 Nico Bailon — tool names, parameter schemas, and the
  research-artifact shape behind `source_check`. <https://github.com/nicobailon/pi-web-access>
- **pi-ketch** © 2026 sovorn-c — extension skeleton and the ketch CLI invocation
  pattern. <https://github.com/sovorn-c/pi-ketch>

The Ketch CLI itself is also MIT: <https://github.com/1broseidon/ketch>.
Camoufox is a separate runtime dependency, not vendored:
<https://github.com/daijro/camoufox> (MIT).