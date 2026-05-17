import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { getStripe } from "@/lib/stripe";
import {
	SaleorWebhookError,
	parseSubscriptionPayload,
	unwrapWebhookSubscriptionPayload,
	verifyAndParseSaleorRequest,
} from "@/lib/saleor-webhook";

/**
 * Sync webhook: TRANSACTION_REFUND_REQUESTED
 * ------------------------------------------
 * Fired by Saleor Dashboard when a staff member clicks "Transfer funds" on the
 * refund screen of an order. Without an app handling this event Dashboard shows
 * the user-visible error: "No app or plugin is configured to handle requested
 * transaction action."
 *
 * Subscription registered by `/api/saleor/install`:
 *   subscription { event { ... on TransactionRefundRequested {
 *     action { amount currency }
 *     transaction { id pspReference }
 *   } } }
 *
 * Saleor expects a JSON response of the shape:
 *   { pspReference, result: "REFUND_SUCCESS" | "REFUND_FAILURE", amount?, message? }
 *
 * Reference: https://docs.saleor.io/api-usage/transactions
 */
export async function POST(request: Request) {
	try {
		const ctx = await verifyAndParseSaleorRequest(request);
		const parsed = parseSubscriptionPayload(ctx.rawBody);
		const payload = unwrapWebhookSubscriptionPayload(parsed) as RefundRequestedPayload | null;

		const refundAction = payload?.action ?? payload?.transactionRefundRequested?.action;
		const transaction = payload?.transaction ?? payload?.transactionRefundRequested?.transaction;
		const pspReference = transaction?.pspReference;

		if (!refundAction || !transaction || !pspReference) {
			console.error("[saleor/refund] Unexpected payload shape:", parsed);
			return NextResponse.json(
				{
					pspReference: pspReference ?? "unknown",
					result: "REFUND_FAILURE",
					message: "Storefront could not parse refund request payload.",
				},
				{ status: 200 },
			);
		}

		const { amount, currency: saleorCurrency } = extractRefundAmountAndCurrency(refundAction);
		if (amount === null || amount <= 0) {
			return NextResponse.json(
				{
					pspReference,
					result: "REFUND_FAILURE",
					message: `Invalid refund amount from Saleor payload: ${JSON.stringify(refundAction)}`,
				},
				{ status: 200 },
			);
		}

		const stripe = getStripe();

		// Stripe wants minor units. Pull the PaymentIntent first so we can
		// validate the currency matches Saleor's refund request.
		const intent = await stripe.paymentIntents.retrieve(pspReference);
		const stripeCurrency = intent.currency.toUpperCase();
		if (saleorCurrency && stripeCurrency !== saleorCurrency.toUpperCase()) {
			return NextResponse.json(
				{
					pspReference,
					result: "REFUND_FAILURE",
					message: `Currency mismatch: Stripe=${stripeCurrency} vs Saleor=${saleorCurrency}`,
				},
				{ status: 200 },
			);
		}

		const stripeAmount = Math.round(amount * 100);
		let refund: Stripe.Refund;
		try {
			refund = await stripe.refunds.create({
				payment_intent: pspReference,
				amount: stripeAmount,
				metadata: { saleorTransactionId: transaction.id },
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : "Stripe refund failed";
			console.error("[saleor/refund] Stripe refunds.create failed:", err);
			return NextResponse.json(
				{ pspReference, result: "REFUND_FAILURE", message },
				{ status: 200 },
			);
		}

		const succeeded = refund.status === "succeeded" || refund.status === "pending";
		return NextResponse.json(
			{
				pspReference: refund.id,
				result: succeeded ? "REFUND_SUCCESS" : "REFUND_FAILURE",
				amount,
				message:
					refund.status === "pending"
						? "Refund issued and pending settlement at Stripe."
						: `Refund ${refund.status} at Stripe.`,
			},
			{ status: 200 },
		);
	} catch (err) {
		if (err instanceof SaleorWebhookError) {
			return NextResponse.json({ error: err.message }, { status: err.status });
		}
		console.error("[saleor/refund] unexpected error:", err);
		const message = err instanceof Error ? err.message : "Unexpected error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

interface RefundRequestedPayload {
	action?: RefundActionShape;
	transaction?: { id: string; pspReference: string };
	transactionRefundRequested?: {
		action?: RefundActionShape;
		transaction?: { id: string; pspReference: string };
	};
}

/** Saleor may send a scalar amount or a Money-shaped field */
type RefundActionShape =
	| { amount?: unknown; currency?: string }
	| Record<string, unknown>;

function parseAmount(input: unknown): number | null {
	if (typeof input === "number" && Number.isFinite(input)) return input;
	if (typeof input === "string") {
		const n = Number(input);
		return Number.isFinite(n) ? n : null;
	}
	return null;
}

function extractRefundAmountAndCurrency(action: RefundActionShape): {
	amount: number | null;
	currency?: string;
} {
	const a = action as Record<string, unknown>;

	let rawAmount: unknown = a.amount;
	let currency: string | undefined =
		typeof a.currency === "string" ? a.currency : undefined;

	if (rawAmount && typeof rawAmount === "object" && !Array.isArray(rawAmount)) {
		const money = rawAmount as Record<string, unknown>;
		if ("amount" in money) {
			rawAmount = money.amount;
		}
		if (!currency && typeof money.currency === "string") {
			currency = money.currency;
		}
	}

	return { amount: parseAmount(rawAmount), currency };
}
