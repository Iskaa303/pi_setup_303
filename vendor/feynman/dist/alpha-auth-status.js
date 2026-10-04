export const ALPHAXIV_USERINFO_ENDPOINT = "https://api.alphaxiv.org/auth/oauth2/userinfo";
export async function verifyAlphaAuthStatus({ getValidToken, fetchImpl = fetch, }) {
    const token = await getValidToken();
    if (!token)
        return { authenticated: false };
    const response = await fetchImpl(ALPHAXIV_USERINFO_ENDPOINT, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
    });
    if ([400, 401, 403].includes(response.status)) {
        return { authenticated: false };
    }
    if (!response.ok) {
        throw new Error(`alphaXiv auth verification failed: ${response.status} ${response.statusText}`);
    }
    const userInfo = await response.json();
    if (typeof userInfo.sub !== "string" || !userInfo.sub) {
        throw new Error("alphaXiv auth verification returned no user subject.");
    }
    const name = typeof userInfo.name === "string" && userInfo.name.trim()
        ? userInfo.name.trim()
        : typeof userInfo.preferred_username === "string" && userInfo.preferred_username.trim()
            ? userInfo.preferred_username.trim()
            : undefined;
    return { authenticated: true, name };
}
