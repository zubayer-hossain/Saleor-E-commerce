import { NextResponse } from "next/server";

import { getStripe } from "@/lib/stripe";
import { saleorAppFetch } from "@/lib/saleor-payments-app";

// `runtime` cannot be exported with `cacheComponents` enabled in next.config.js.

/**
 * Finalize
 * --------
 * Body: { checkoutId, paymentIntentId, transactionId }
 *
 * Called from the browser after `stripe.confirmPayment` resolves successfully
 * (or on return from a 3DS redirect). Must be idempotent — the webhook can
 * race this call.
 *
 * Steps:
 * 1. Retrieve the PaymentIntent server-side (don't trust the client about status).
 * 2. Report a CHARGE_SUCCESS transaction event to Saleor so the checkout flips
 *    to charged. The Stripe webhook ALSO does this — `transactionEventReport`
 *    is naturally idempotent on `transactionId` + `pspReference`.
 * 3. `checkoutComplete` to create the order.
 * 4. Return `{ orderId }` so the UI can redirect to the confirmation page.
 */
export async function POST(request: Request) {
	try {
		const body = (await request.json().catch(() => ({}))) as {
			checkoutId?: string;
			paymentIntentId?: string;
			transactionId?: string;
		};

		if (!body.checkoutId || !body.paymentIntentId || !body.transactionId) {
			return NextResponse.json(
				{ error: "checkoutId, paymentIntentId, and transactionId are required" },
				{ status: 400 },
			);
		}

		const stripe = getStripe();
		const intent = await stripe.paymentIntents.retrieve(body.paymentIntentId);

		if (intent.status !== "succeeded") {
			return NextResponse.json(
				{
					error: `PaymentIntent not succeeded (status: ${intent.status})`,
					paymentIntentStatus: intent.status,
				},
				{ status: 402 },
			);
		}

		// 2) Mark the transaction as charged. Webhook may have already reported this;
		//    Saleor accepts duplicate event reports with the same pspReference + type.
		const eventReport = await saleorAppFetch<{
			transactionEventReport: {
				errors: Array<{ message: string; field?: string; code?: string }>;
			};
		}>(
			`mutation StripeChargeSuccess(
				$id: ID!
				$type: TransactionEventTypeEnum!
				$amount: PositiveDecimal!
				$pspReference: String!
			) {
				transactionEventReport(
					id: $id
					type: $type
					amount: $amount
					pspReference: $pspReference
				) {
					errors { message field code }
				}
			}`,
			{
				id: body.transactionId,
				type: "CHARGE_SUCCESS",
				amount: (intent.amount_received ?? intent.amount) / 100,
				pspReference: intent.id,
			},
		);

		const evErrors = eventReport.data?.transactionEventReport?.errors ?? [];
		if (evErrors.length > 0) {
			// `ALREADY_EXISTS` for the same pspReference is fine — webhook beat us.
			const fatal = evErrors.filter((e) => e.code !== "ALREADY_EXISTS");
			if (fatal.length > 0) {
				console.error("[stripe/finalize] transactionEventReport errors:", fatal);
				return NextResponse.json({ error: fatal.map((e) => e.message).join("; ") }, { status: 500 });
			}
		}

		// 3) Create the Saleor order.
		const completed = await saleorAppFetch<{
			checkoutComplete: {
				order: { id: string; number: string } | null;
				errors: Array<{ message: string; field?: string; code?: string }>;
			};
		}>(
			`mutation StripeCheckoutComplete($id: ID!) {
				checkoutComplete(id: $id) {
					order { id number }
					errors { message field code }
				}
			}`,
			{ id: body.checkoutId },
		);

		const completeErrors = completed.data?.checkoutComplete?.errors ?? [];
		if (completeErrors.length > 0) {
			console.error("[stripe/finalize] checkoutComplete errors:", completeErrors);
			return NextResponse.json(
				{ error: completeErrors.map((e) => `${e.field ?? "?"}: ${e.message}`).join("; ") },
				{ status: 500 },
			);
		}

		const order = completed.data?.checkoutComplete?.order;
		if (!order) {
			return NextResponse.json({ error: "Saleor returned no order" }, { status: 500 });
		}

		return NextResponse.json({ orderId: order.id, orderNumber: order.number });
	} catch (err) {
		console.error("[stripe/finalize] unexpected error:", err);
		const message = err instanceof Error ? err.message : "Unexpected error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}
