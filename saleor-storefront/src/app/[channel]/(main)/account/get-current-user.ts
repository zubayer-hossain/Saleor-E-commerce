import type { AccountUser } from "@/lib/auth/account-session";
import { fetchAccountSession } from "@/lib/auth/account-session";

export type { AccountUser };

/**
 * Fetch the current user profile for account pages (memoized per request via fetchAccountSession cache).
 */
export async function getCurrentUser(): Promise<AccountUser | null> {
	const session = await fetchAccountSession();
	return session.status === "authenticated" ? session.user : null;
}

export { fetchAccountSession };
