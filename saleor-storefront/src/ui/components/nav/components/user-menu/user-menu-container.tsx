import { cookies } from "next/headers";
import { UserIcon } from "lucide-react";
import { UserMenu } from "./user-menu";
import { LinkWithChannel } from "@/ui/atoms/link-with-channel";
import { fetchAccountSession } from "@/lib/auth/account-session";
import { hasSaleorAuthCookies } from "@/lib/auth/saleor-auth-cookies";

export async function UserMenuContainer() {
	let cookieJar: Array<{ name: string }> = [];
	try {
		const cookieStore = await cookies();
		cookieJar = cookieStore.getAll();
	} catch {
		// Static generation — cookies() unavailable
	}

	if (!hasSaleorAuthCookies(cookieJar)) {
		return (
			<LinkWithChannel
				href="/login"
				className="inline-flex h-10 w-10 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-accent-foreground"
			>
				<UserIcon className="h-5 w-5" aria-hidden="true" />
				<span className="sr-only">Log in</span>
			</LinkWithChannel>
		);
	}

	const session = await fetchAccountSession();

	if (session.status === "authenticated") {
		return <UserMenu user={session.user} />;
	}

	return (
		<LinkWithChannel
			href="/login"
			className="inline-flex h-10 w-10 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-accent-foreground"
		>
			<UserIcon className="h-5 w-5" aria-hidden="true" />
			<span className="sr-only">Log in</span>
		</LinkWithChannel>
	);
}
