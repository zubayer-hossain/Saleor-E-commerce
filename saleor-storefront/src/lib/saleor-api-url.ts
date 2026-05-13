/**
 * Saleor GraphQL URL used by Node/server-side code (RSC, Route Handlers,
 * `executePublicGraphQL`, auth cookie refresh).
 *
 * Browser code must call {@link getSaleorGraphQLUrlForBrowser} — `NEXT_PUBLIC_*`
 * is often set to `host.docker.internal` for Dockerized Next.js, which the browser
 * cannot resolve.
 */
export function getSaleorGraphQLUrlServer(): string {
	const url = process.env.SALEOR_API_SERVER_URL ?? process.env.NEXT_PUBLIC_SALEOR_API_URL;
	if (!url) {
		throw new Error("Missing NEXT_PUBLIC_SALEOR_API_URL (set SALEOR_API_SERVER_URL when browser URL differs)");
	}
	return url;
}

const DOCKER_INTERNAL_HOSTS = new Set(["host.docker.internal", "kubernetes.docker.internal"]);

/**
 * GraphQL URL for the browser and for `@saleor/auth-sdk` session keys on **both** client and server.
 *
 * Use **`localhost`** (not `127.0.0.1`) when normalizing loopback: Saleor JWT `iss` is usually
 * `http://localhost:8000/graphql/`, and the auth SDK omits `Authorization` when the request URL
 * does not match `iss` unless `allowPassingTokenToThirdPartyDomains` is set.
 *
 * Server-side `fetchWithAuth` still POSTs to {@link getSaleorGraphQLUrlServer}; cookie names must
 * match this canonical host so RSC sees the same tokens the browser stored after login.
 */
export function getSaleorGraphQLUrlForBrowser(publicUrl: string): string {
	try {
		const u = new URL(publicUrl);
		if (DOCKER_INTERNAL_HOSTS.has(u.hostname) || u.hostname === "127.0.0.1") {
			u.hostname = "localhost";
			return u.href;
		}
	} catch {
		/* ignore */
	}
	return publicUrl;
}
