/**
 * Camoufox worker for ketch-web-access.
 *
 * Camoufox (https://camoufox.com) is a Firefox fork with C++-level fingerprint
 * patching, driven through playwright-core. It is the "real browser" escape
 * hatch for pages Ketch's bundled headless Chromium cannot get past: bot
 * walls, Cloudflare-style JS challenges, fingerprint-sensitive sites.
 *
 * Run as a child process on purpose: camoufox-js pulls native deps and a 660MB
 * browser, and the extension must keep working when neither is installed.
 *
 *   node browser.mjs --status
 *   node browser.mjs '{"urls":["https://example.com"],"maxChars":20000}'
 *
 * Prints one JSON object on stdout. Never throws for expected failures.
 */

import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const MAX_PAGES = 8;
// ponytail: one browser for the whole batch, launched with whatever launchOptions
// camoufox returns. Persistent sessions are not modelled; add them when a task
// actually needs to log in and keep state across calls.
const DEFAULT_TIMEOUT_MS = 60_000;

function camoufoxHome() {
  return process.env.CAMOUFOX_INSTALL_DIR || join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "camoufox");
}

/** Where camoufox-js may live: extension node_modules, pi's npm dir, or CAMOUFOX_JS. */
function candidateModulePaths() {
  return [
    process.env.CAMOUFOX_JS,
    join(import.meta.dirname, "node_modules", "camoufox-js"),
    join(homedir(), ".pi", "agent", "npm", "node_modules", "camoufox-js"),
  ].filter(Boolean);
}

async function loadCamoufox() {
  try {
    return await import("camoufox-js");
  } catch {
    // not resolvable from here; try the well-known locations
  }
  const require = createRequire(import.meta.url);
  for (const path of candidateModulePaths()) {
    try {
      return await import(require.resolve("camoufox-js", { paths: [path] }));
    } catch {
      /* try next */
    }
  }
  return undefined;
}

function statusPayload(installed, binary) {
  const home = camoufoxHome();
  const binaryPath = binary || join(home, "camoufox-bin");
  return {
    ok: Boolean(installed && existsSync(binaryPath)),
    engine: "camoufox",
    browser: binaryPath,
    browser_installed: existsSync(binaryPath),
    client_installed: Boolean(installed),
    install_hint: "npm install camoufox-js && npx camoufox-js fetch",
  };
}

async function render(payload) {
  const urls = (Array.isArray(payload.urls) ? payload.urls : []).slice(0, MAX_PAGES);
  if (!urls.length) return { ok: false, error: "no urls", pages: [] };

  const camoufox = await loadCamoufox();
  if (!camoufox?.Camoufox) return { ...statusPayload(false), error: "camoufox-js is not installed" };

  const home = camoufoxHome();
  if (!existsSync(join(home, "camoufox-bin"))) {
    return { ...statusPayload(true), error: `camoufox browser is missing; run: npx camoufox-js fetch` };
  }

  const options = {
    headless: payload.headless !== false,
    humanize: payload.humanize === true,
    block_images: payload.blockImages === true,
    ...(payload.os ? { os: payload.os } : {}),
    ...(payload.geoip ? { geoip: payload.geoip } : {}),
    ...(payload.proxy ? { proxy: payload.proxy } : {}),
  };

  const timeout = Math.min(300_000, Math.max(5_000, payload.timeoutMs || DEFAULT_TIMEOUT_MS));
  const browser = await camoufox.Camoufox(options);
  const pages = [];
  try {
    for (const url of urls) {
      const page = await browser.newPage();
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout });
        if (payload.waitFor) await page.waitForTimeout(Math.min(30_000, payload.waitFor));
        if (payload.selector) await page.waitForSelector(payload.selector, { timeout: Math.min(timeout, 20_000) });
        const html = payload.selector ? await page.locator(payload.selector).first().innerHTML() : await page.content();
        pages.push({ url, fetched_url: page.url(), status: 200, html });
      } catch (error) {
        pages.push({ url, html: "", error: error instanceof Error ? error.message : String(error) });
      } finally {
        await page.close().catch(() => {});
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
  return { ok: true, engine: "camoufox", pages };
}

async function main() {
  const arg = process.argv[2];
  if (arg === "--status" || arg === undefined) {
    const camoufox = await loadCamoufox();
    process.stdout.write(`${JSON.stringify(statusPayload(Boolean(camoufox?.Camoufox)))}\n`);
    return;
  }
  const payload = JSON.parse(arg);
  process.stdout.write(`${JSON.stringify(await render(payload))}\n`);
}

main().catch((error) => {
  process.stdout.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error), pages: [] })}\n`);
  process.exitCode = 1;
});