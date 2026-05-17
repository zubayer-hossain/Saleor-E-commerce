import "server-only";

import Stripe from "stripe";

/**
 * Server-side Stripe SDK singleton.
 *
 * Uses the latest pinned API version so PaymentIntent shapes are predictable across
 * SDK upgrades. The secret key is read from STRIPE_SECRET_KEY (test mode: `sk_test_…`).
 *
 * Per Stripe best practices, this file never runs in the browser — it imports
 * `server-only` so any accidental client import errors at build time.
 */
let cached: Stripe | null = null;

export function getStripe(): Stripe {
	if (cached) return cached;
	const key = process.env.STRIPE_SECRET_KEY;
	if (!key) {
		throw new Error(
			"Missing STRIPE_SECRET_KEY. Set it in saleor-storefront/.env (use sk_test_… for test mode).",
		);
	}
	cached = new Stripe(key, {
		// Pin a version so SDK upgrades don't silently change request/response shapes.
		apiVersion: "2025-08-27.basil" as Stripe.LatestApiVersion,
		typescript: true,
		// Use the fetch-based HTTP client. Stripe's default Node `https.Agent`
		// breaks inside Next.js App Router route handlers ("StripeConnectionError:
		// Request was retried 2 times" even though `fetch()` to api.stripe.com
		// works) because of socket-pool / keepAlive contention with Next's
		// undici-based fetch. Using Stripe's fetch client routes both through the
		// same transport and fixes it.
		httpClient: Stripe.createFetchHttpClient(),
		maxNetworkRetries: 2,
		appInfo: {
			// IMPORTANT: ASCII only. Stripe ships this string in the User-Agent
			// header; Next.js's patched fetch rejects non-ByteString chars (em-dash
			// `—` (U+2014), smart quotes, etc.) with
			//   "Cannot convert argument to a ByteString because the character at
			//    index N has a value of X which is greater than 255".
			name: "Saleor Storefront direct Stripe demo",
			version: "0.1.0",
		},
	});
	return cached;
}

export function getStripeWebhookSecret(): string {
	const secret = process.env.STRIPE_WEBHOOK_SECRET;
	if (!secret) {
		throw new Error(
			"Missing STRIPE_WEBHOOK_SECRET. Forward webhooks via `stripe listen --forward-to localhost:3000/api/stripe/webhook` and copy the printed signing secret.",
		);
	}
	return secret;
}
