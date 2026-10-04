import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
const UNSAFE_PROVIDER_ID = /[./\\]/;
function validateProviderId(providerId) {
    if (!providerId || typeof providerId !== "string") {
        return { ok: false, error: "provider id must be a non-empty string" };
    }
    if (UNSAFE_PROVIDER_ID.test(providerId)) {
        return { ok: false, error: `provider id "${providerId}" contains unsafe characters (dots or slashes)` };
    }
    return { ok: true };
}
function readModelsJson(modelsJsonPath) {
    if (!existsSync(modelsJsonPath)) {
        return { ok: true, value: { providers: {} } };
    }
    try {
        const raw = readFileSync(modelsJsonPath, "utf8").trim();
        if (!raw) {
            return { ok: true, value: { providers: {} } };
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") {
            return { ok: false, error: `Invalid models.json (expected an object): ${modelsJsonPath}` };
        }
        return { ok: true, value: parsed };
    }
    catch (error) {
        return {
            ok: false,
            error: `Failed to read models.json: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
}
export function upsertProviderBaseUrl(modelsJsonPath, providerId, baseUrl) {
    return upsertProviderConfig(modelsJsonPath, providerId, { baseUrl });
}
export function upsertProviderConfig(modelsJsonPath, providerId, patch) {
    const idCheck = validateProviderId(providerId);
    if (!idCheck.ok) {
        return idCheck;
    }
    const loaded = readModelsJson(modelsJsonPath);
    if (!loaded.ok) {
        return loaded;
    }
    const value = loaded.value;
    const providers = {
        ...(value.providers && typeof value.providers === "object" ? value.providers : {}),
    };
    const currentProvider = providers[providerId] && typeof providers[providerId] === "object" ? providers[providerId] : {};
    const nextProvider = { ...currentProvider };
    if (patch.baseUrl !== undefined)
        nextProvider.baseUrl = patch.baseUrl;
    if (patch.apiKey !== undefined)
        nextProvider.apiKey = patch.apiKey;
    if (patch.api !== undefined)
        nextProvider.api = patch.api;
    if (patch.authHeader !== undefined)
        nextProvider.authHeader = patch.authHeader;
    if (patch.headers !== undefined)
        nextProvider.headers = patch.headers;
    if (patch.models !== undefined)
        nextProvider.models = patch.models;
    providers[providerId] = nextProvider;
    return writeModelsJson(modelsJsonPath, { ...value, providers });
}
function writeModelsJson(modelsJsonPath, next) {
    try {
        mkdirSync(dirname(modelsJsonPath), { recursive: true });
        writeFileSync(modelsJsonPath, JSON.stringify(next, null, 2) + "\n", "utf8");
        // models.json can contain API keys/headers; default to user-only permissions.
        try {
            chmodSync(modelsJsonPath, 0o600);
        }
        catch {
            // ignore permission errors (best-effort)
        }
        return { ok: true };
    }
    catch (error) {
        return { ok: false, error: `Failed to write models.json: ${error instanceof Error ? error.message : String(error)}` };
    }
}
// Pi resolves an environment variable in `apiKey` only as $NAME or ${NAME}; a
// bare name such as LITELLM_MASTER_KEY is sent as the key itself.
const BARE_ENV_NAME = /^[A-Z][A-Z0-9_]*$/;
export function apiKeyReference(value) {
    return BARE_ENV_NAME.test(value) ? `$${value}` : value;
}
// Feynman's setup wrote bare names before Pi 0.99 stopped resolving them, so a
// LiteLLM or custom provider sent "LITELLM_MASTER_KEY" as its key. Returns the
// providers it rewrote to $NAME.
export function migrateBareEnvApiKeys(modelsJsonPath) {
    if (!existsSync(modelsJsonPath))
        return [];
    const read = readModelsJson(modelsJsonPath);
    if (!read.ok)
        return [];
    const providers = { ...(read.value.providers ?? {}) };
    const migrated = Object.keys(providers).filter((id) => {
        const apiKey = providers[id]?.apiKey;
        return typeof apiKey === "string" && BARE_ENV_NAME.test(apiKey);
    });
    if (migrated.length === 0)
        return [];
    for (const id of migrated) {
        const provider = providers[id];
        providers[id] = { ...provider, apiKey: apiKeyReference(provider.apiKey) };
    }
    return writeModelsJson(modelsJsonPath, { ...read.value, providers }).ok ? migrated : [];
}
