"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/ui/components/ui/button";

interface AccountAuthUnavailableProps {
	message: string;
}

/**
 * Soft network-recovery screen — shown when the server layout failed to reach
 * Saleor while loading the account profile. Auto-retries via `router.refresh()`
 * on a backoff schedule, so the user does not have to do anything in 99% of
 * cases (Saleor recovers, the next render serves the page).
 *
 * Worded carefully so it does NOT look like a forced logout — users keep their
 * session and we say so explicitly.
 */
export function AccountAuthUnavailable({ message }: AccountAuthUnavailableProps) {
	const router = useRouter();
	const [attempt, setAttempt] = useState(0);
	const [reconnecting, setReconnecting] = useState(true);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		// Backoff: 2s, 4s, 6s, 10s, 15s, then stop and let the user retry.
		const SCHEDULE_MS = [2000, 4000, 6000, 10000, 15000] as const;
		if (attempt >= SCHEDULE_MS.length) {
			setReconnecting(false);
			return;
		}
		timerRef.current = setTimeout(() => {
			router.refresh();
			setAttempt((n) => n + 1);
		}, SCHEDULE_MS[attempt]);
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, [attempt, router]);

	const handleManualRetry = () => {
		setReconnecting(true);
		setAttempt(0);
		router.refresh();
	};

	return (
		<div className="mx-auto flex max-w-lg flex-col items-center px-4 py-16 text-center">
			<div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-foreground">
				{reconnecting ? (
					<Loader2 className="h-5 w-5 animate-spin" aria-hidden />
				) : (
					<RefreshCw className="h-5 w-5" aria-hidden />
				)}
			</div>
			<h1 className="text-xl font-semibold text-foreground">
				{reconnecting ? "Reconnecting to the store…" : "Still can't reach the store"}
			</h1>
			<p className="mt-3 max-w-md text-sm text-muted-foreground">
				You're still signed in — the storefront couldn't load your account data this time.
				{reconnecting
					? " We'll keep trying in the background."
					: " Please check your connection and try again."}
			</p>
			{message ? (
				<p className="mt-3 font-mono text-[11px] text-muted-foreground/70" aria-hidden>
					{message}
				</p>
			) : null}
			<Button onClick={handleManualRetry} className="mt-8 h-11 px-6">
				{reconnecting ? "Retry now" : "Try again"}
			</Button>
		</div>
	);
}
