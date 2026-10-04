import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { readJsonFile } from "../config/json-file.js";
import { getFeynmanAgentDir, getFeynmanHome } from "../config/paths.js";
// pi-web-access reads web-search.json from PI_CODING_AGENT_DIR.
export function getPiWebSearchConfigPath(home) {
    const feynmanHome = home ? resolve(home, ".feynman") : getFeynmanHome();
    return resolve(getFeynmanAgentDir(feynmanHome), "web-search.json");
}
function normalizeProvider(value) {
    return value === "auto" || value === "perplexity" || value === "exa" || value === "gemini" ? value : undefined;
}
function normalizeWorkflow(value) {
    return value === "none" || value === "summary-review" ? value : undefined;
}
function normalizeNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
export function loadPiWebAccessConfig(configPath = getPiWebSearchConfigPath()) {
    if (!existsSync(configPath)) {
        return {};
    }
    try {
        const parsed = readJsonFile(configPath);
        return parsed && typeof parsed === "object" ? parsed : {};
    }
    catch {
        return {};
    }
}
export function savePiWebAccessConfig(updates, configPath = getPiWebSearchConfigPath()) {
    const merged = { ...loadPiWebAccessConfig(configPath) };
    for (const [key, value] of Object.entries(updates)) {
        if (value === undefined) {
            delete merged[key];
        }
        else {
            merged[key] = value;
        }
    }
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, JSON.stringify(merged, null, 2) + "\n", "utf8");
    // web-search.json can contain provider API keys; default to user-only permissions.
    try {
        chmodSync(configPath, 0o600);
    }
    catch {
        // ignore permission errors (best-effort)
    }
}
function formatRouteLabel(provider) {
    switch (provider) {
        case "perplexity":
            return "Perplexity";
        case "exa":
            return "Exa";
        case "gemini":
            return "Gemini";
        default:
            return "Auto";
    }
}
function formatRouteNote(provider) {
    switch (provider) {
        case "perplexity":
            return "Pi web-access will use Perplexity for search.";
        case "exa":
            return "Pi web-access will use Exa for search.";
        case "gemini":
            return "Pi web-access will use Gemini API. Browser-cookie fallback is opt-in.";
        default:
            return "Pi web-access will try Exa, then Perplexity, then Gemini API. Browser-cookie fallback is opt-in.";
    }
}
export function getPiWebAccessStatus(config = loadPiWebAccessConfig(), configPath = getPiWebSearchConfigPath()) {
    const searchProvider = normalizeProvider(config.searchProvider) ?? normalizeProvider(config.route) ?? normalizeProvider(config.provider) ?? "auto";
    const requestProvider = normalizeProvider(config.provider) ?? normalizeProvider(config.route) ?? searchProvider;
    const workflow = normalizeWorkflow(config.workflow) ?? "none";
    const perplexityConfigured = Boolean(normalizeNonEmptyString(config.perplexityApiKey));
    const exaConfigured = Boolean(normalizeNonEmptyString(config.exaApiKey));
    const geminiApiConfigured = Boolean(normalizeNonEmptyString(config.geminiApiKey));
    const chromeProfile = normalizeNonEmptyString(config.browserCookies?.profile);
    const geminiBrowserEnabled = config.allowBrowserCookies === true;
    const effectiveProvider = searchProvider;
    return {
        configPath,
        configExists: existsSync(configPath),
        searchProvider,
        requestProvider,
        workflow,
        perplexityConfigured,
        exaConfigured,
        geminiApiConfigured,
        chromeProfile,
        geminiBrowserEnabled,
        routeLabel: formatRouteLabel(effectiveProvider),
        note: formatRouteNote(effectiveProvider),
    };
}
export function formatPiWebAccessDoctorLines(status = getPiWebAccessStatus()) {
    const configPathSuffix = status.configExists ? "" : " (not created yet)";
    const lines = [
        "web access: pi-web-access",
        `  search route: ${status.routeLabel}`,
        `  request route: ${status.requestProvider}`,
        `  search workflow: ${status.workflow}`,
        `  perplexity api: ${status.perplexityConfigured ? "configured" : "not configured"}`,
        `  exa api: ${status.exaConfigured ? "configured" : "not configured"}`,
        `  gemini api: ${status.geminiApiConfigured ? "configured" : "not configured"}`,
        `  gemini browser fallback: ${status.geminiBrowserEnabled ? "enabled" : "disabled"}`,
        `  config path: ${status.configPath}${configPathSuffix}`,
        `  note: ${status.note}`,
    ];
    if (status.geminiBrowserEnabled && status.chromeProfile) {
        lines.splice(8, 0, `  gemini browser profile: ${status.chromeProfile}`);
    }
    if (!status.configExists) {
        lines.push("  hint: run `feynman search set <auto|perplexity|exa|gemini> [api-key]` to configure web search");
    }
    return lines;
}
