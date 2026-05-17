import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { CurrentUserProfileDocument, type CurrentUserProfileQuery } from "@/gql/graphql";
import { executeAuthenticatedGraphQL } from "@/lib/graphql";
import { encodeCookieName } from "./constants";
import { getSaleorGraphQLUrlForBrowser } from "@/lib/saleor-api-url";

export type AccountUser = NonNullable<CurrentUserProfileQuery["me"]>;

export type AccountSessionState =
	| { status: "authenticated"; user: AccountUser; stale?: boolean }
	| { status: "anonymous" }
	| { status: "error"; kind: "network" | "other"; message: string };

interface CachedSession {
	user: AccountUser;
	cachedAt: number;
}

/**
 * Process-level cache of the last successful CurrentUserProfile result, keyed
 * by the (hashed) refresh-token cookie value.
 *
 * Purpose: when Saleor blips for a few seconds (very common with Docker dev),
 * the very next render would otherwise downgrade the user to "Unable to reach
 * your account" — which feels like a forced logout. With a cache, we serve the
 * last known profile (flagged `stale: true`) for up to {@link STALE_WINDOW_MS}
 * so the account page keeps rendering while we transparently recover.
 *
 * The cache is bounded; if we never get a real recovery, the entry expires.
 */
const STALE_WINDOW_MS = 60_000;
const sessionCache = new Map<string, CachedSession>();

async function getCacheKey(): Promise<string | null> {
	try {
		const cookieStore = await cookies();
		const raw = process.env.NEXT_PUBLIC_SALEOR_API_URL ?? "";
		const apiUrl = getSaleorGraphQLUrlForBrowser(raw);
		// Both tokens contribute uniqueness; we prefer the refresh token because
		// it survives access-token rotations.
		const refreshKey = encodeCookieName(`${apiUrl}+saleor_auth_refresh_token`);
		const refresh = cookieStore.get(refreshKey)?.value ?? null;
		if (refresh) return `r:${refresh.slice(-32)}`;
		const accessKey = encodeCookieName(`${apiUrl}+saleor_auth_access_token`);
		const access = cookieStore.get(accessKey)?.value ?? null;
		return access ? `a:${access.slice(-32)}` : null;
	} catch {
		return null;
	}
}

/**
 * Resolved once per React server request (deduped via React `cache`).
 * Distinguishes real anonymous sessions from transient API failures.
 */
export const fetchAccountSession = cache(async (): Promise<AccountSessionState> => {
	const cacheKey = await getCacheKey();

	const result = await executeAuthenticatedGraphQL(CurrentUserProfileDocument, {
		cache: "no-cache",
	});

	if (result.ok && result.data.me) {
		if (cacheKey) {
			sessionCache.set(cacheKey, { user: result.data.me, cachedAt: Date.now() });
		}
		return { status: "authenticated", user: result.data.me };
	}

	if (result.ok && !result.data.me) {
		// Confirmed anonymous — drop any stale cache for this key.
		if (cacheKey) sessionCache.delete(cacheKey);
		return { status: "anonymous" };
	}

	// result.ok === false: try to recover from a recent known-good session.
	if (cacheKey) {
		const cached = sessionCache.get(cacheKey);
		if (cached && Date.now() - cached.cachedAt < STALE_WINDOW_MS) {
			return { status: "authenticated", user: cached.user, stale: true };
		}
	}

	if (!result.ok && result.error.type === "network") {
		return { status: "error", kind: "network", message: result.error.message };
	}
	if (!result.ok && result.error.type === "http" && (result.error.statusCode === 401 || result.error.statusCode === 403)) {
		// Real authorization failure — surface as anonymous so caller redirects to login.
		if (cacheKey) sessionCache.delete(cacheKey);
		return { status: "anonymous" };
	}
	return { status: "error", kind: "other", message: result.ok ? "Unknown" : result.error.message };
});
