import { NextResponse } from "next/server";

import { getStripe } from "@/lib/stripe";
import { saleorAppFetch } from "@/lib/saleor-payments-app";

// `runtime` cannot be exported here because next.config.js enables `cacheComponents`
// (Partial Prerendering). Node is the default runtime for route handlers anyway.

/**
 * Create-Intent
 * -------------
 * Body: { checkoutId: string }
 *
 * Steps:
 * 1. Look up the checkout total + currency in Saleor.
 * 2. Create a Stripe PaymentIntent for that amount (test mode keys → no real charge).
 *    NOTE: Per Stripe best-practices we DO NOT pass `payment_method_types`. Dynamic
 *    payment methods come from the Stripe Dashboard.
 * 3. Register a Saleor `transactionCreate` with the PaymentIntent id as pspReference.
 *    This is what links the Stripe charge to the checkout in Saleor's ledger and is
 *    why `checkoutComplete` will succeed later.
 * 4. Return `{ clientSecret, transactionId }` so the browser can render the
 *    Stripe Payment Element and confirm the payment in-browser.
 */
export async function POST(request: Request) {
	try {
		const body = (await request.json().catch(() => ({}))) as { checkoutId?: string };
		const checkoutId = body.checkoutId;
		if (!checkoutId) {
			return NextResponse.json({ error: "checkoutId is required" }, { status: 400 });
		}

		// 1) Pull the live total from Saleor — never trust an amount from the browser.
		const checkoutLookup = await saleorAppFetch<{
			checkout: {
				id: string;
				totalPrice: { gross: { amount: number; currency: string } };
				channel: { slug: string };
				billingAddress: { firstName?: string; lastName?: string; country?: { code?: string } } | null;
				email?: string | null;
			} | null;
		}>(
			`query CheckoutForStripe($id: ID!) {
				checkout(id: $id) {
					id
					email
					channel { slug }
					billingAddress {
						firstName
						lastName
						country { code }
					}
					totalPrice {
						gross { amount currency }
					}
				}
			}`,
			{ id: checkoutId },
		);

		const checkout = checkoutLookup.data?.checkout;
		if (!checkout) {
			return NextResponse.json({ error: "Checkout not found" }, { status: 404 });
		}

		const amount = Math.round(checkout.totalPrice.gross.amount * 100);
		const currency = checkout.totalPrice.gross.currency.toLowerCase();
		if (amount <= 0) {
			return NextResponse.json({ error: "Checkout total must be positive" }, { status: 400 });
		}

		// 2) Stripe PaymentIntent. Metadata is the bridge back to the checkout
		//    in the webhook handler (if the browser disconnects mid-payment).
		const stripe = getStripe();
		const intent = await stripe.paymentIntents.create({
			amount,
			currency,
			capture_method: "automatic",
			metadata: {
				checkoutId,
				channel: checkout.channel.slug,
			},
			receipt_email: checkout.email || undefined,
			description: `Saleor checkout ${checkout.id}`,
		});

		if (!intent.client_secret) {
			return NextResponse.json({ error: "Stripe did not return a client secret" }, { status: 502 });
		}

		// 3) Register the transaction on Saleor so checkoutComplete sees an authorized payment.
		//    `pspReference` = Stripe PaymentIntent id is what lets webhooks find this transaction later.
		const txCreate = await saleorAppFetch<{
			transactionCreate: {
				transaction: { id: string } | null;
				errors: Array<{ message: string; field?: string; code?: string }>;
			};
		}>(
			`mutation StripeTransactionCreate(
				$id: ID!
				$transaction: TransactionCreateInput!
			) {
				transactionCreate(id: $id, transaction: $transaction) {
					transaction { id }
					errors { message field code }
				}
			}`,
			{
				id: checkoutId,
				transaction: {
					name: "Stripe Card",
					message: `PaymentIntent ${intent.id}`,
					pspReference: intent.id,
					availableActions: ["REFUND"],
					// `amountAuthorized` reserves the funds against the checkout total so
					// `checkoutComplete` accepts the payment as covering the order.
					amountAuthorized: {
						amount: checkout.totalPrice.gross.amount,
						currency: checkout.totalPrice.gross.currency,
					},
				},
			},
		);

		const txErrors = txCreate.data?.transactionCreate?.errors ?? [];
		if (txErrors.length > 0) {
			console.error("[stripe/create-intent] transactionCreate errors:", txErrors);
			// Cancel the orphan PaymentIntent so it doesn't sit in Stripe.
			await stripe.paymentIntents.cancel(intent.id).catch(() => {});
			return NextResponse.json(
				{ error: txErrors.map((e) => e.message).join("; ") || "Saleor transactionCreate failed" },
				{ status: 500 },
			);
		}

		const transactionId = txCreate.data?.transactionCreate?.transaction?.id;
		if (!transactionId) {
			await stripe.paymentIntents.cancel(intent.id).catch(() => {});
			return NextResponse.json({ error: "Saleor returned no transaction" }, { status: 500 });
		}

		return NextResponse.json({
			clientSecret: intent.client_secret,
			paymentIntentId: intent.id,
			transactionId,
			amount: checkout.totalPrice.gross.amount,
			currency: checkout.totalPrice.gross.currency,
		});
	} catch (err) {
		console.error("[stripe/create-intent] unexpected error:", err);
		const message = err instanceof Error ? err.message : "Unexpected error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
