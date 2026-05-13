"use client";

import { Suspense, useActionState, useEffect, useMemo, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useCart } from "@/ui/components/cart/cart-context";
import { addProductToCartAction, type AddProductToCartState } from "./add-product-to-cart-action";

interface ProductAddToCartFormInnerProps {
	channel: string;
	productSlug: string;
	variantIds: readonly string[];
	singleVariantFallbackId?: string | null;
	children: ReactNode;
	className?: string;
}

function messageForCartState(state: Exclude<AddProductToCartState, null | { ok: true }>): string {
	if (state.detail?.trim()) return state.detail.trim();
	switch (state.reason) {
		case "missing-variant":
			return "Select all options before adding to your bag.";
		case "bad-variant-encoding":
			return "This variant selection is invalid. Try choosing the options again.";
		case "no-checkout":
			return "We couldn't start a cart. Refresh the page and try again.";
		case "graphql-failed":
			return "Unable to reach the server. Try again in a moment.";
		case "saleor-rejected":
			return "Cannot add this item to your cart (availability or catalogue rules).";
		case "empty-lines-response":
			return "Something went wrong while updating your cart. Try again.";
		case "exception":
			return "Something went wrong. Try again.";
		default:
			return "Couldn't add this item to your cart.";
	}
}

function AddToCartFormFeedback({ state }: { state: AddProductToCartState }) {
	if (!state || state.ok !== false) return null;
	const message = messageForCartState(state);
	return (
		<p
			className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
			role="alert"
			aria-live="polite"
		>
			{message}
		</p>
	);
}

/** Ignore `?variant=` unless it belongs to this product — stale IDs break every PDP add-to-cart */
function computeEffectiveVariantId(
	variantFromUrl: string | null,
	singleVariantFallbackId: string | null | undefined,
	allowed: ReadonlySet<string>,
): string {
	const fromUrl = variantFromUrl && allowed.has(variantFromUrl) ? variantFromUrl : "";
	const fallback =
		singleVariantFallbackId && allowed.has(singleVariantFallbackId) ? singleVariantFallbackId : "";
	return fromUrl || fallback || "";
}

function ProductAddToCartFormInner({
	channel,
	productSlug,
	variantIds,
	singleVariantFallbackId,
	children,
	className,
}: ProductAddToCartFormInnerProps) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const variantFromUrl = searchParams.get("variant");

	const allowedIds = useMemo(() => new Set(variantIds), [variantIds]);

	const effectiveVariantId = useMemo(
		() =>
			computeEffectiveVariantId(
				variantFromUrl,
				singleVariantFallbackId ?? null,
				allowedIds,
			),
		[variantFromUrl, singleVariantFallbackId, allowedIds],
	);

	const { openCart } = useCart();
	const [state, formAction] = useActionState(addProductToCartAction, null as AddProductToCartState);

	useEffect(() => {
		if (state?.ok) {
			router.refresh();
			openCart();
		}
	}, [state, router, openCart]);

	const formKey = `${productSlug}:${channel}:${effectiveVariantId}`;

	return (
		<form key={formKey} action={formAction} className={className}>
			<input type="hidden" name="channel" value={channel} />
			<input type="hidden" name="variantId" value={effectiveVariantId} />
			<AddToCartFormFeedback state={state} />
			{children}
		</form>
	);
}

interface ProductAddToCartFormProps extends Omit<ProductAddToCartFormInnerProps, "children"> {
	children: ReactNode;
	className?: string;
}

function ProductAddToCartFormFallback({
	channel,
	productSlug,
	variantIds,
	singleVariantFallbackId,
	children,
	className,
}: ProductAddToCartFormInnerProps) {
	const router = useRouter();
	const { openCart } = useCart();
	const [state, formAction] = useActionState(addProductToCartAction, null as AddProductToCartState);

	useEffect(() => {
		if (state?.ok) {
			router.refresh();
			openCart();
		}
	}, [state, router, openCart]);

	const allowedIds = useMemo(() => new Set(variantIds), [variantIds]);
	const effectiveVariantId = computeEffectiveVariantId(
		null,
		singleVariantFallbackId ?? null,
		allowedIds,
	);

	const formKey = `${productSlug}:${channel}:${effectiveVariantId}`;

	return (
		<form key={formKey} action={formAction} className={className}>
			<input type="hidden" name="channel" value={channel} />
			<input type="hidden" name="variantId" value={effectiveVariantId} />
			<AddToCartFormFeedback state={state} />
			{children}
		</form>
	);
}

/**
 * Add-to-cart form: ignores foreign `?variant=` IDs from other products; POSTs variant + channel;
 * shows Saleor errors; refreshes server components and opens the drawer on success.
 */
export function ProductAddToCartForm({
	channel,
	productSlug,
	variantIds,
	singleVariantFallbackId,
	children,
	className,
}: ProductAddToCartFormProps) {
	return (
		<Suspense
			fallback={
				<ProductAddToCartFormFallback
					channel={channel}
					productSlug={productSlug}
					variantIds={variantIds}
					singleVariantFallbackId={singleVariantFallbackId}
					className={className}
				>
					{children}
				</ProductAddToCartFormFallback>
			}
		>
			<ProductAddToCartFormInner
				channel={channel}
				productSlug={productSlug}
				variantIds={variantIds}
				singleVariantFallbackId={singleVariantFallbackId}
				className={className}
			>
				{children}
			</ProductAddToCartFormInner>
		</Suspense>
	);
}
