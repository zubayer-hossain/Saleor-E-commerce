import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { getStripe, getStripeWebhookSecret } from "@/lib/stripe";
import { saleorAppFetch } from "@/lib/saleor-payments-app";

// `runtime` cannot be exported with `cacheComponents` enabled in next.config.js.

/**
 * Stripe → Storefront webhook
 * ---------------------------
 * Verifies the Stripe signature, then mirrors the PaymentIntent status into
 * Saleor's transaction ledger via `transactionEventReport`.
 *
 * This is the **safety net** for the case where the customer's browser dies
 * between `confirmPayment` succeeding on Stripe's side and our `/finalize`
 * call reaching Saleor. The webhook runs even with the browser closed.
 *
 * Why we don't call `checkoutComplete` here:
 * - The checkout may still be in the middle of `/finalize` on the browser.
 *   The customer's session is the right context to materialize the order
 *   so cookies & cart cleanup happen in one place.
 * - The transaction event is enough for Saleor to consider the payment
 *   captured; an internal cron or admin action can pick up uncompleted
 *   checkouts later if needed.
 *
 * Local dev: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
 * — copy the printed `whsec_…` into STRIPE_WEBHOOK_SECRET.
 */
export async function POST(request: Request) {
	const signature = request.headers.get("stripe-signature");
	if (!signature) {
		return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
	}

	let event: Stripe.Event;
	try {
		// Raw body required for signature verification — read once as text.
		const rawBody = await request.text();
		const stripe = getStripe();
		event = stripe.webhooks.constructEvent(rawBody, signature, getStripeWebhookSecret());
	} catch (err) {
		const message = err instanceof Error ? err.message : "signature verification failed";
		console.error("[stripe/webhook] signature error:", message);
		return NextResponse.json({ error: `Webhook signature verification failed: ${message}` }, { status: 400 });
	}

	try {
		switch (event.type) {
			case "payment_intent.succeeded": {
				const intent = event.data.object;
				await reportEvent(intent, "CHARGE_SUCCESS");
				break;
			}
			case "payment_intent.payment_failed": {
				const intent = event.data.object;
				await reportEvent(intent, "CHARGE_FAILURE", intent.last_payment_error?.message);
				break;
			}
			case "charge.refunded": {
				const charge = event.data.object;
				if (charge.payment_intent && typeof charge.payment_intent === "string") {
					const stripe = getStripe();
					const intent = await stripe.paymentIntents.retrieve(charge.payment_intent);
					await reportEvent(intent, "REFUND_SUCCESS");
				}
				break;
			}
			default:
				// Ignore other events but ack so Stripe doesn't retry forever.
				break;
		}
		return NextResponse.json({ received: true });
	} catch (err) {
		console.error("[stripe/webhook] handler error:", err);
		// Returning 500 makes Stripe retry — that's what we want for transient issues.
		const message = err instanceof Error ? err.message : "Unexpected webhook error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

async function reportEvent(
	intent: Stripe.PaymentIntent,
	type: "CHARGE_SUCCESS" | "CHARGE_FAILURE" | "REFUND_SUCCESS",
	message?: string,
) {
	// Look up the Saleor transaction by pspReference (= Stripe PaymentIntent id).
	const lookup = await saleorAppFetch<{
		transactions: { edges: Array<{ node: { id: string; pspReference: string } }> };
	}>(
		`query StripeFindTx($pspReference: String!) {
			transactions(filter: { pspReference: $pspReference }, first: 1) {
				edges { node { id pspReference } }
			}
		}`,
		{ pspReference: intent.id },
	);

	const node = lookup.data?.transactions?.edges?.[0]?.node;
	if (!node) {
		// Race: webhook fired before create-intent finished. Stripe will retry.
		throw new Error(`No Saleor transaction yet for pspReference=${intent.id}`);
	}

	const result = await saleorAppFetch<{
		transactionEventReport: { errors: Array<{ message: string; code?: string }> };
	}>(
		`mutation StripeWebhookEvent(
			$id: ID!
			$type: TransactionEventTypeEnum!
			$amount: PositiveDecimal!
			$pspReference: String!
			$message: String
		) {
			transactionEventReport(
				id: $id
				type: $type
				amount: $amount
				pspReference: $pspReference
				message: $message
			) {
				errors { message code }
			}
		}`,
		{
			id: node.id,
			type,
			amount: (intent.amount_received ?? intent.amount) / 100,
			pspReference: intent.id,
			message,
		},
	);

	const errors = (result.data?.transactionEventReport?.errors ?? []).filter(
		(e) => e.code !== "ALREADY_EXISTS",
	);
	if (errors.length > 0) {
		throw new Error(`transactionEventReport failed: ${errors.map((e) => e.message).join("; ")}`);
	}
}
