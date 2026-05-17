"use client";

import { type FC } from "react";
import { useSaleorAuthContext } from "@saleor/auth-sdk/react";

export interface SignedInUserProps {
	/** User email or basic info */
	user: { email: string };
	/** Called after sign-out */
	onSignOut: () => void;
}

/**
 * Displays signed-in user info with sign-out option.
 *
 * Saleor stays logged in via cookies until refresh expires or the user signs out.
 * Checkout must not imply they just authenticated today — copy explains “saved session”.
 */
export const SignedInUser: FC<SignedInUserProps> = ({ user, onSignOut }) => {
	const { signOut } = useSaleorAuthContext();

	const handleSignOut = () => {
		signOut();
		onSignOut();
	};

	return (
		<div className="bg-muted/30 flex items-center justify-between gap-3 rounded-lg border border-border p-4">
			<div className="flex min-w-0 flex-1 items-center gap-3">
				<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
					{user.email.charAt(0).toUpperCase()}
				</div>
				<div className="min-w-0 flex-1">
					<p className="break-words font-medium">{user.email}</p>
					<p className="text-sm leading-snug text-muted-foreground">
						Saved sign-in on this browser — we will use your account for this order. Sign out below to shop as a guest
						with another email.
					</p>
				</div>
			</div>
			<button
				type="button"
				onClick={handleSignOut}
				className="shrink-0 self-start text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground hover:no-underline"
			>
				Sign out
			</button>
		</div>
	);
};
