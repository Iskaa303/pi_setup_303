import { runPi } from "./launch.js";
import { buildPiEnv } from "./runtime.js";
export const OPTIONAL_PACKAGE_PRESETS = {
    memory: {
        description: "Research-session preference and correction memory.",
        source: "npm:@samfp/pi-memory",
    },
    hindsight: {
        description: "Hindsight-backed research continuity memory.",
        source: "npm:@luxusai/pi-hindsight",
    },
};
export function normalizeOptionalPackagePresetName(name) {
    const normalized = name.trim().toLowerCase();
    return normalized in OPTIONAL_PACKAGE_PRESETS ? normalized : undefined;
}
export function listOptionalPackagePresets() {
    return Object.keys(OPTIONAL_PACKAGE_PRESETS)
        .map((name) => ({ name, ...OPTIONAL_PACKAGE_PRESETS[name] }));
}
export function resolvePackageSource(name) {
    const preset = normalizeOptionalPackagePresetName(name);
    return preset ? OPTIONAL_PACKAGE_PRESETS[preset].source : name.trim();
}
// Package installs and updates go through Pi's own package manager so they
// land in <agentDir>/npm exactly as `pi install` / `pi update` would.
export async function installPiPackage(options, source) {
    return runPi(options, ["install", source], buildPiEnv(options));
}
export async function removePiPackage(options, source) {
    return runPi(options, ["remove", source], buildPiEnv(options));
}
export async function updatePiPackages(options, source) {
    return runPi(options, source ? ["update", source] : ["update", "--extensions"], buildPiEnv(options));
}
