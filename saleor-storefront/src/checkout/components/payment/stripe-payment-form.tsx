"use client";

import { useEffect, useMemo, useState, useCallback, type FC } from "react";
import { loadStripe, type Stripe, type StripeElementsOptions } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Lock, AlertCircle } from "lucide-react";
import { Button } from "@/ui/components/ui/button";
import { LoadingSpinner } from "@/checkout/ui-kit/loading-spinner";

/**
 * Stripe Payment Element host
 * ---------------------------
 * - Loads `Stripe.js` once with the publishable key (`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`)
 * - Renders the official Payment Element (handles cards + 3DS automatically)
 * - On submit, calls our `/api/stripe/create-intent` to get a clientSecret tied
 *   to a Saleor `transactionCreate`, then `stripe.confirmPayment` to charge the card.
 * - Sets `return_url` so 3DS-protected cards round-trip cleanly back to the checkout page.
 *
 * Per Stripe best practices we DO NOT enumerate `payment_method_types`. Stripe Dashboard
 * controls which methods are eligible; for "card-only" use the Dashboard's
 * Payment Method Configurations to restrict it.
 */

const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

let stripePromise: Promise<Stripe | null> | null = null;
function getStripePromise(): Promise<Stripe | null> {
	if (!STRIPE_PUBLISHABLE_KEY) {
		return Promise.resolve(null);
	}
	if (!stripePromise) {
		stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);
	}
	return stripePromise;
}

export interface StripePaymentFormProps {
	checkoutId: string;
	amount: number;
	currency: string;
	billingName?: string;
	billingEmail?: string;
	disabled?: boolean;
	/** Called once we have a Saleor order id (after /finalize succeeds). */
	onOrderCreated: (orderId: string) => void;
	/** Surface unexpected errors to the parent so it can show a banner. */
	onError?: (message: string) => void;
	/** Slot for "Return to shipping" buttons etc. — gets the disabled state. */
	renderActions?: (args: { isProcessing: boolean }) => React.ReactNode;
}

export const StripePaymentForm: FC<StripePaymentFormProps> = (props) => {
	const { amount, currency } = props;
	const [stripeInstance, setStripeInstance] = useState<Stripe | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);

	useEffect(() => {
		if (!STRIPE_PUBLISHABLE_KEY) {
			setLoadError(
				"Stripe is not configured. Set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY in saleor-storefront/.env (use pk_test_… for test mode).",
			);
			return;
		}
		let active = true;
		getStripePromise()
			.then((s) => {
				if (active) setStripeInstance(s);
			})
			.catch((err) => {
				if (active) {
					setLoadError(err instanceof Error ? err.message : "Failed to load Stripe");
				}
			});
		return () => {
			active = false;
		};
	}, []);

	const options = useMemo<StripeElementsOptions>(
		() => ({
			mode: "payment",
			amount: Math.round(amount * 100),
			currency: currency.toLowerCase(),
			appearance: { theme: "stripe" },
			// We intentionally omit `paymentMethodTypes` — Stripe Dashboard controls which
			// methods are offered (see PaymentMethodConfigurations for "card only").
		}),
		[amount, currency],
	);

	if (loadError) {
		return (
			<div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
				<AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
				<div>
					<p className="font-medium text-amber-800">Payment unavailable</p>
					<p className="mt-1 text-sm text-amber-700">{loadError}</p>
				</div>
			</div>
		);
	}

	if (!stripeInstance) {
		return (
			<div className="flex items-center gap-3 rounded-lg border border-border p-4 text-sm text-muted-foreground">
				<LoadingSpinner />
				Loading secure payment…
			</div>
		);
	}

	return (
		<Elements stripe={stripeInstance} options={options}>
			<InnerForm {...props} />
		</Elements>
	);
};

const InnerForm: FC<StripePaymentFormProps> = ({
	checkoutId,
	amount,
	currency,
	billingName,
	billingEmail,
	disabled,
	onOrderCreated,
	onError,
	renderActions,
}) => {
	const stripe = useStripe();
	const elements = useElements();
	const [isProcessing, setIsProcessing] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);

	// If we're returning from a 3DS redirect, Stripe puts `?payment_intent=…&payment_intent_client_secret=…`
	// in the URL. Detect it, verify status, and finalize the Saleor order without re-prompting the user.
	useEffect(() => {
		if (!stripe) return;
		const url = new URL(window.location.href);
		const clientSecret = url.searchParams.get("payment_intent_client_secret");
		const paymentIntentId = url.searchParams.get("payment_intent");
		if (!clientSecret || !paymentIntentId) return;

		const transactionId = sessionStorage.getItem(`stripe:txn:${paymentIntentId}`);
		if (!transactionId) {
			// Different tab / cleared storage — let the user resubmit instead of guessing.
			return;
		}

		let cancelled = false;
		(async () => {
			setIsProcessing(true);
			try {
				const finalize = await fetch("/api/stripe/finalize", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ checkoutId, paymentIntentId, transactionId }),
				});
				const payload = (await finalize.json().catch(() => ({}))) as {
					orderId?: string;
					error?: string;
				};
				if (cancelled) return;
				if (!finalize.ok || !payload.orderId) {
					setFormError(payload.error || "Payment captured but order could not be created.");
					onError?.(payload.error || "Order finalization failed");
					return;
				}
				sessionStorage.removeItem(`stripe:txn:${paymentIntentId}`);
				onOrderCreated(payload.orderId);
			} finally {
				if (!cancelled) setIsProcessing(false);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [stripe, checkoutId, onOrderCreated, onError]);

	const handleSubmit = useCallback(
		async (event: React.FormEvent) => {
			event.preventDefault();
			setFormError(null);

			if (!stripe || !elements) {
				setFormError("Payment system is still initializing. Please wait a moment and try again.");
				return;
			}

			setIsProcessing(true);
			try {
				// Validate fields in the Payment Element first.
				const { error: submitError } = await elements.submit();
				if (submitError) {
					setFormError(submitError.message ?? "Please review your card details.");
					return;
				}

				// Create a fresh PaymentIntent + Saleor transaction every submit. Replacing
				// any previous intent avoids amount-mismatch issues if the cart changed mid-session.
				const createRes = await fetch("/api/stripe/create-intent", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ checkoutId }),
				});
				const createPayload = (await createRes.json().catch(() => ({}))) as {
					clientSecret?: string;
					paymentIntentId?: string;
					transactionId?: string;
					error?: string;
				};
				if (!createRes.ok || !createPayload.clientSecret || !createPayload.paymentIntentId) {
					setFormError(createPayload.error || "Could not start the payment. Please try again.");
					return;
				}

				// Stash the transaction id so the 3DS-return handler can finalize without
				// another network round-trip to look it up by pspReference.
				sessionStorage.setItem(
					`stripe:txn:${createPayload.paymentIntentId}`,
					createPayload.transactionId ?? "",
				);

				const returnUrl = new URL(window.location.href);
				returnUrl.searchParams.set("processingPayment", "true");

				const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
					elements,
					clientSecret: createPayload.clientSecret,
					confirmParams: {
						return_url: returnUrl.toString(),
						payment_method_data: {
							billing_details: {
								name: billingName || undefined,
								email: billingEmail || undefined,
							},
						},
					},
					// If a card needs 3DS, this redirects to Stripe and the page reloads with query params.
					// "if_required" keeps us on the page when no redirect is needed (most test cards).
					redirect: "if_required",
				});

				if (confirmError) {
					setFormError(confirmError.message ?? "Payment failed. Please try a different card.");
					return;
				}

				if (!paymentIntent || paymentIntent.status !== "succeeded") {
					setFormError(`Payment is not complete (status: ${paymentIntent?.status ?? "unknown"}).`);
					return;
				}

				// No redirect required — finalize inline.
				const finalize = await fetch("/api/stripe/finalize", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						checkoutId,
						paymentIntentId: createPayload.paymentIntentId,
						transactionId: createPayload.transactionId,
					}),
				});
				const finalizePayload = (await finalize.json().catch(() => ({}))) as {
					orderId?: string;
					error?: string;
				};
				if (!finalize.ok || !finalizePayload.orderId) {
					setFormError(finalizePayload.error || "Payment captured but the order could not be created.");
					onError?.(finalizePayload.error || "Order finalization failed");
					return;
				}

				sessionStorage.removeItem(`stripe:txn:${createPayload.paymentIntentId}`);
				onOrderCreated(finalizePayload.orderId);
			} catch (err) {
				const msg = err instanceof Error ? err.message : "Unexpected payment error";
				setFormError(msg);
				onError?.(msg);
			} finally {
				setIsProcessing(false);
			}
		},
		[stripe, elements, checkoutId, billingName, billingEmail, onOrderCreated, onError],
	);

	const isDisabled = disabled || isProcessing || !stripe || !elements;

	return (
		<form onSubmit={handleSubmit} className="space-y-6">
			<div className="rounded-lg border border-border p-4">
				<PaymentElement options={{ layout: "tabs" }} />
			</div>

			{formError && (
				<div className="border-destructive/50 bg-destructive/10 flex items-start gap-3 rounded-lg border p-4">
					<AlertCircle className="h-5 w-5 flex-shrink-0 text-destructive" />
					<div>
						<p className="font-medium text-destructive">Payment failed</p>
						<p className="text-destructive/80 text-sm">{formError}</p>
					</div>
				</div>
			)}

			<div className="flex items-center justify-between gap-4">
				{renderActions?.({ isProcessing })}
				<Button type="submit" disabled={isDisabled} className="hidden h-12 min-w-[220px] px-8 md:flex">
					{isProcessing ? (
						<span className="flex items-center gap-2">
							<LoadingSpinner />
							Processing payment…
						</span>
					) : (
						<span className="flex items-center gap-2">
							<Lock className="h-4 w-4" />
							Pay {currency.toUpperCase()} {amount.toFixed(2)}
						</span>
					)}
				</Button>
			</div>
		</form>
	);
};
