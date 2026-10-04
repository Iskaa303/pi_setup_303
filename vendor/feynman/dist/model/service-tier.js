import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { readJsonFile } from "../config/json-file.js";
export const FEYNMAN_SERVICE_TIERS = [
    "auto",
    "default",
    "flex",
    "priority",
    "standard_only",
];
const SERVICE_TIER_SET = new Set(FEYNMAN_SERVICE_TIERS);
const OPENAI_SERVICE_TIERS = new Set(["auto", "default", "flex", "priority"]);
const ANTHROPIC_SERVICE_TIERS = new Set(["auto", "standard_only"]);
function readSettings(settingsPath) {
    try {
        return readJsonFile(settingsPath);
    }
    catch {
        return {};
    }
}
export function normalizeServiceTier(value) {
    if (!value)
        return undefined;
    const normalized = value.trim().toLowerCase();
    return SERVICE_TIER_SET.has(normalized) ? normalized : undefined;
}
export function getConfiguredServiceTier(settingsPath) {
    const settings = readSettings(settingsPath);
    return normalizeServiceTier(typeof settings.serviceTier === "string" ? settings.serviceTier : undefined);
}
export function setConfiguredServiceTier(settingsPath, tier) {
    const settings = readSettings(settingsPath);
    if (tier) {
        settings.serviceTier = tier;
    }
    else {
        delete settings.serviceTier;
    }
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf8");
}
export function resolveActiveServiceTier(settingsPath) {
    return normalizeServiceTier(process.env.FEYNMAN_SERVICE_TIER) ?? getConfiguredServiceTier(settingsPath);
}
export function resolveProviderServiceTier(provider, tier) {
    if (!provider || !tier)
        return undefined;
    if ((provider === "openai" || provider === "openai-codex") && OPENAI_SERVICE_TIERS.has(tier)) {
        return tier;
    }
    if (provider === "anthropic" && ANTHROPIC_SERVICE_TIERS.has(tier)) {
        return tier;
    }
    return undefined;
}
