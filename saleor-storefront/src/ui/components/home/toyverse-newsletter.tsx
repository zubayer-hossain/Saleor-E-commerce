"use client";

import { useState } from "react";

import { Button } from "@/ui/components/ui/button";

export function ToyverseNewsletterSection() {
	const [submitted, setSubmitted] = useState(false);

	return (
		<section
			className="rounded-3xl border border-border/80 bg-gradient-to-br from-secondary via-background to-secondary px-6 py-12 shadow-inner md:px-12 md:py-14"
			aria-labelledby="newsletter-heading"
		>
			<div className="mx-auto max-w-2xl text-center">
				<h2 id="newsletter-heading" className="font-display text-3xl font-bold text-foreground md:text-4xl">
					Play ideas in your inbox
				</h2>
				<p className="mt-3 text-muted-foreground">
					Demo newsletter — no emails are sent. Perfect for showcasing a polished capture moment on your pitch.
				</p>
				{submitted ?
					<p className="mt-8 rounded-2xl bg-success/15 px-4 py-3 text-sm font-medium text-foreground">
						Thanks! You&apos;re on the list — check your inbox for surprise play ideas soon.
					</p>
				:	<form
						className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center"
						onSubmit={(e) => {
							e.preventDefault();
							setSubmitted(true);
						}}
					>
						<label htmlFor="toyverse-newsletter-email" className="sr-only">
							Email address
						</label>
						<input
							id="toyverse-newsletter-email"
							name="email"
							type="email"
							required
							autoComplete="email"
							placeholder="you@example.com"
							className="h-12 min-w-[240px] flex-1 rounded-full border border-input bg-background px-5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
						<Button type="submit" size="lg" className="rounded-full px-10 font-bold shadow-md">
							Subscribe
						</Button>
					</form>
				}
			</div>
		</section>
	);
}
