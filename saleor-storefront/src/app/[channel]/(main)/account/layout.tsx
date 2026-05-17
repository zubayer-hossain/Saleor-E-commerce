import { type ReactNode, Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AccountNav } from "@/ui/components/account/account-nav";
import { AccountSkeleton } from "@/ui/components/account/account-skeleton";
import { AccountProvider } from "@/ui/components/account/account-context";
import { AccountAuthUnavailable } from "@/ui/components/account/account-auth-unavailable";
import { fetchAccountSession } from "./get-current-user";
import { DefaultChannelSlug } from "@/app/config";

export const metadata = {
	title: "My Account",
};

export default function AccountLayout({ children }: { children: ReactNode }) {
	return (
		<Suspense fallback={<AccountSkeleton />}>
			<AccountShell>{children}</AccountShell>
		</Suspense>
	);
}

async function AccountShell({ children }: { children: ReactNode }) {
	const headersList = await headers();
	const pathname =
		headersList.get("x-pathname") ??
		(DefaultChannelSlug ? `/${DefaultChannelSlug}/account` : "/account");

	const channel =
		pathname.split("/").filter(Boolean)[0] ?? DefaultChannelSlug ?? null;

	if (!channel) {
		redirect("/");
	}

	const session = await fetchAccountSession();

	// Network blip while loading account data — show soft auto-recovering
	// "Reconnecting…" screen instead of taking the user to login. We also fall
	// through here for non-network errors (rare); login-redirect happens only
	// for explicit anonymous status (no user from Saleor) or 401/403.
	if (session.status === "error") {
		return <AccountAuthUnavailable message={session.message} />;
	}

	if (session.status === "authenticated") {
		return (
			<AccountProvider user={session.user}>
				<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
					<div className="flex flex-col gap-8 md:flex-row">
						<aside className="shrink-0 md:min-h-[60vh] md:w-52">
							<AccountNav />
						</aside>
						<div className="min-w-0 flex-1">{children}</div>
					</div>
				</div>
			</AccountProvider>
		);
	}

	// Anonymous or hard auth failure — full login page with deep-link back
	const nextTarget = pathname.startsWith("/") ? pathname : `/${channel}/account`;
	redirect(`/${channel}/login?next=${encodeURIComponent(nextTarget)}`);
}