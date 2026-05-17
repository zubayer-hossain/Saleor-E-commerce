"use client";

import { useCallback, useEffect, useState, type FC } from "react";
import { ChevronLeft, AlertCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import {
	type CheckoutFragment,
	type CountryCode,
	type AddressFragment,
	useCheckoutBillingAddressUpdateMutation,
} from "@/checkout/graphql";
import { useCheckout } from "@/checkout/hooks/use-checkout";
import { useUser } from "@/checkout/hooks/use-user";
import { getAddressInputData } from "@/checkout/components/address-form/utils";
import { createQueryString } from "@/checkout/lib/utils/url";
import { readSaleorLanguageCodeFromDocumentCookie } from "@/lib/saleor-language-cookie";

import { CheckoutSummaryContext, buildPaymentSummaryRows } from "./checkout-summary-context";
import { MobileStickyAction } from "./mobile-sticky-action";
import { getStepNumber } from "./flow";

import {
	BillingAddressSection,
	StripePaymentForm,
	type BillingAddressData,
} from "@/checkout/components/payment";

interface PaymentStepProps {
	checkout: CheckoutFragment;
	onBack: () => void;
	onGoToInformation?: () => void;
}

/**
 * Stripe-only payment step.
 *
 * Why Stripe only:
 * - Per requirements we accept Stripe Card / Wallets exclusively.
 * - The Stripe Payment Element handles dynamic methods (Card, Apple/Google Pay,
 *   Link, etc.) configured in the Stripe Dashboard — restrict to "card" there
 *   if you want literal card-only.
 *
 * Flow:
 * 1. User edits billing address (or "same as shipping" copies the shipping address).
 * 2. We push the billing address to Saleor via `checkoutBillingAddressUpdate`.
 * 3. `<StripePaymentForm>` does Payment Element + `/api/stripe/create-intent`
 *    + `stripe.confirmPayment` + `/api/stripe/finalize` → returns an `orderId`.
 * 4. We push `?orderId=…` into the URL — `root-views.tsx` swaps to the
 *    `OrderConfirmation` view based on that param.
 */
export const PaymentStep: FC<PaymentStepProps> = ({
	checkout: initialCheckout,
	onBack,
	onGoToInformation,
}) => {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { checkout: liveCheckout } = useCheckout();
	const checkout = liveCheckout || initialCheckout;

	const { user, authenticated } = useUser();

	const isShippingRequired = checkout.isShippingRequired;
	const hasShippingAddress = !!checkout.shippingAddress;
	const shippingAddress = checkout.shippingAddress;

	const [sameAsBilling, setSameAsBilling] = useState(isShippingRequired && hasShippingAddress);
	const [billingData, setBillingData] = useState<BillingAddressData>(() => ({
		countryCode: (checkout.billingAddress?.country?.code as CountryCode) || "US",
		formData: {
			firstName: checkout.billingAddress?.firstName || "",
			lastName: checkout.billingAddress?.lastName || "",
			streetAddress1: checkout.billingAddress?.streetAddress1 || "",
			streetAddress2: checkout.billingAddress?.streetAddress2 || "",
			companyName: checkout.billingAddress?.companyName || "",
			city: checkout.billingAddress?.city || "",
			postalCode: checkout.billingAddress?.postalCode || "",
			countryArea: checkout.billingAddress?.countryArea || "",
			phone: checkout.billingAddress?.phone || "",
		},
	}));

	useEffect(() => {
		const billing = checkout.billingAddress;
		if (!billing) return;
		setBillingData((prev) => ({
			...prev,
			countryCode: (billing.country?.code as CountryCode) || "US",
			formData: {
				firstName: billing.firstName || "",
				lastName: billing.lastName || "",
				streetAddress1: billing.streetAddress1 || "",
				streetAddress2: billing.streetAddress2 || "",
				companyName: billing.companyName || "",
				city: billing.city || "",
				postalCode: billing.postalCode || "",
				countryArea: billing.countryArea || "",
				cityArea: billing.cityArea || "",
				phone: billing.phone || "",
			},
		}));
	}, [checkout.billingAddress]);

	const [errors, setErrors] = useState<Record<string, string>>({});
	const [isSavingAddress, setIsSavingAddress] = useState(false);
	const [billingSaved, setBillingSaved] = useState(false);

	const [, updateBillingAddress] = useCheckoutBillingAddressUpdateMutation();

	const summaryRows = buildPaymentSummaryRows(checkout);

	const handleGoToStep = (step: number) => {
		if (step === 1 && onGoToInformation) {
			onGoToInformation();
		} else if (step === 2) {
			onBack();
		}
	};

	const handleBillingDataChange = useCallback((data: BillingAddressData) => {
		setBillingData(data);
		setBillingSaved(false);
	}, []);

	const handleSameAsBillingChange = useCallback((value: boolean) => {
		setSameAsBilling(value);
		setBillingSaved(false);
	}, []);

	/**
	 * Push the latest billing address to Saleor. We do this BEFORE Stripe confirms
	 * the payment so the invoice/receipt fields are correct, and so that
	 * `checkoutComplete` doesn't 4xx with "billing address required".
	 *
	 * Returns true if the address is persisted (or already up-to-date).
	 */
	const persistBillingAddress = useCallback(async (): Promise<boolean> => {
		const needsBillingForm = !sameAsBilling || !hasShippingAddress;
		const languageCode = readSaleorLanguageCodeFromDocumentCookie();

		setErrors({});
		setIsSavingAddress(true);
		try {
			let addressInput;

			if (needsBillingForm) {
				if (billingData.selectedAddressId && user?.addresses) {
					const selected = user.addresses.find((a) => a.id === billingData.selectedAddressId);
					if (selected) {
						addressInput = getAddressInputData({
							firstName: selected.firstName || "",
							lastName: selected.lastName || "",
							streetAddress1: selected.streetAddress1 || "",
							streetAddress2: selected.streetAddress2 || "",
							companyName: selected.companyName || "",
							city: selected.city || "",
							postalCode: selected.postalCode || "",
							countryArea: selected.countryArea || "",
							phone: selected.phone || "",
							countryCode: selected.country?.code as CountryCode,
						});
					}
				}
				if (!addressInput) {
					addressInput = getAddressInputData({
						...billingData.formData,
						countryCode: billingData.countryCode,
					});
				}
			} else if (shippingAddress) {
				addressInput = getAddressInputData({
					firstName: shippingAddress.firstName || "",
					lastName: shippingAddress.lastName || "",
					streetAddress1: shippingAddress.streetAddress1 || "",
					streetAddress2: shippingAddress.streetAddress2 || "",
					companyName: shippingAddress.companyName || "",
					city: shippingAddress.city || "",
					postalCode: shippingAddress.postalCode || "",
					countryArea: shippingAddress.countryArea || "",
					phone: shippingAddress.phone || "",
					countryCode: shippingAddress.country?.code as CountryCode,
				});
			}

			if (!addressInput) {
				setErrors({ streetAddress1: "Missing billing address details." });
				return false;
			}

			const result = await updateBillingAddress({
				checkoutId: checkout.id,
				billingAddress: addressInput,
				languageCode,
			});

			if (result.error) {
				setErrors({ streetAddress1: "Failed to update billing address." });
				return false;
			}
			const billingErrors = result.data?.checkoutBillingAddressUpdate?.errors ?? [];
			if (billingErrors.length) {
				const errorMap: Record<string, string> = {};
				billingErrors.forEach((e) => {
					const field = e.field || "streetAddress1";
					errorMap[field] = e.message || "Invalid value";
				});
				setErrors(errorMap);
				const firstField = Object.keys(errorMap)[0];
				if (firstField) {
					const el = document.querySelector(`[name="${firstField}"]`) as HTMLElement | null;
					el?.focus();
				}
				return false;
			}

			setBillingSaved(true);
			return true;
		} finally {
			setIsSavingAddress(false);
		}
	}, [
		sameAsBilling,
		hasShippingAddress,
		billingData,
		user?.addresses,
		shippingAddress,
		checkout.id,
		updateBillingAddress,
	]);

	// Eagerly persist "same as shipping" — most users never edit that path,
	// so the Stripe button isn't blocked behind a hidden form save.
	useEffect(() => {
		if (sameAsBilling && hasShippingAddress && !billingSaved && !isSavingAddress) {
			void persistBillingAddress();
		}
		// We deliberately depend only on the toggle; persistBillingAddress changes on every render
		// because of `billingData`, which would trigger an infinite loop here.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [sameAsBilling, hasShippingAddress]);

	const handleStripeOrderCreated = useCallback(
		(orderId: string) => {
			// Setting `orderId` in the URL is enough — RootViews swaps to <OrderConfirmation/>
			// the moment that query param is present. DO NOT also call onComplete(): that
			// would call goToStep("CONFIRMATION") with a STALE searchParams snapshot and
			// strip `orderId` back off the URL, dropping us into the legacy "Demo Mode"
			// ConfirmationStep view with a fake DEMO-… order number.
			const newQuery = createQueryString(searchParams, { orderId });
			router.replace(`?${newQuery}`, { scroll: false });
		},
		[router, searchParams],
	);

	const handleStripeError = useCallback((message: string) => {
		setErrors((prev) => ({ ...prev, payment: message }));
	}, []);

	const total = checkout.totalPrice?.gross;
	const totalAmount = total?.amount ?? 0;
	const totalCurrency = total?.currency ?? "USD";

	const billingFullName =
		[billingData.formData.firstName, billingData.formData.lastName].filter(Boolean).join(" ") ||
		[shippingAddress?.firstName, shippingAddress?.lastName].filter(Boolean).join(" ");

	// The Stripe button is gated by a fresh billing-address save unless we're
	// reusing the shipping address. This is what we tell the form to disable on.
	const billingReady = sameAsBilling && hasShippingAddress ? billingSaved || !isSavingAddress : billingSaved;

	return (
		<div className="space-y-8">
			<CheckoutSummaryContext checkout={checkout} rows={summaryRows} onGoToStep={handleGoToStep} />

			{/* Stripe Test Mode hint (only shown when key is pk_test_…) */}
			{process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test_") && (
				<div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
					<AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
					<div>
						<p className="font-medium text-blue-800">Stripe Test Mode</p>
						<p className="mt-1 text-sm text-blue-700">
							Use card <code>4242 4242 4242 4242</code>, any future date, any CVC. No real charge.
						</p>
					</div>
				</div>
			)}

			<BillingAddressSection
				billingAddress={checkout.billingAddress}
				shippingAddress={shippingAddress}
				userAddresses={authenticated ? (user?.addresses as AddressFragment[]) : undefined}
				defaultBillingAddressId={user?.defaultBillingAddress?.id}
				isShippingRequired={isShippingRequired}
				errors={errors}
				onChange={handleBillingDataChange}
				onSameAsShippingChange={handleSameAsBillingChange}
				initialSameAsShipping={sameAsBilling}
			/>

			{/* Save billing button — only needed when the user typed a fresh address. */}
			{!billingSaved && (!sameAsBilling || !hasShippingAddress) && (
				<div className="flex justify-end">
					<button
						type="button"
						onClick={() => {
							void persistBillingAddress();
						}}
						className="text-sm font-medium text-foreground underline hover:no-underline disabled:opacity-50"
						disabled={isSavingAddress}
					>
						{isSavingAddress ? "Saving billing address…" : "Use this billing address"}
					</button>
				</div>
			)}

			<section className="space-y-4">
				<h2 className="text-lg font-semibold">Payment</h2>
				<p className="text-sm text-muted-foreground">
					Payments are processed securely by Stripe. Card details never touch our servers.
				</p>

				<StripePaymentForm
					checkoutId={checkout.id}
					amount={totalAmount}
					currency={totalCurrency}
					billingName={billingFullName}
					billingEmail={checkout.email ?? undefined}
					disabled={!billingReady}
					onOrderCreated={handleStripeOrderCreated}
					onError={handleStripeError}
					renderActions={({ isProcessing }) => (
						<button
							type="button"
							onClick={onBack}
							disabled={isProcessing}
							className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
						>
							<ChevronLeft className="h-4 w-4" />
							{isShippingRequired ? "Return to shipping" : "Return to information"}
						</button>
					)}
				/>
			</section>

			{errors.payment && (
				<div className="border-destructive/50 bg-destructive/10 flex items-start gap-3 rounded-lg border p-4">
					<AlertCircle className="h-5 w-5 flex-shrink-0 text-destructive" />
					<div>
						<p className="font-medium text-destructive">Payment failed</p>
						<p className="text-destructive/80 text-sm">{errors.payment}</p>
					</div>
				</div>
			)}

			{/* Mobile sticky action is intentionally inert on this step — Stripe Payment
			    Element + its built-in 3DS handling owns the submit on small screens too. */}
			<MobileStickyAction
				step={getStepNumber("PAYMENT", isShippingRequired)}
				isShippingRequired={isShippingRequired}
				type="button"
				onAction={() => {
					/* Stripe form owns the submit button; mobile shows its own. */
				}}
				isLoading={false}
				disabled={true}
				total={`${totalCurrency.toUpperCase()} ${totalAmount.toFixed(2)}`}
				loadingText=""
			/>
		</div>
	);
};
