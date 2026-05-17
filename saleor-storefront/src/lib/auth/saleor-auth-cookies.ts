/**
 * Detect Saleor Auth SDK cookies after {@link encodeCookieName} encoding.
 * Substrings stay alphanumeric so they remain recognizable in cookie names.
 */
export function isSaleorAuthCookieName(name: string): boolean {
	return (
		name.includes("saleor_auth_access_token") || name.includes("saleor_auth_refresh_token")
	);
}

export function hasSaleorAuthCookies(cookies: Iterable<{ name: string }>): boolean {
	for (const c of cookies) {
		if (isSaleorAuthCookieName(c.name)) return true;
	}
	return false;
}
