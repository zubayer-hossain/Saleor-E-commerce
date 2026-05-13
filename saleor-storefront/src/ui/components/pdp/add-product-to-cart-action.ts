"use server";

import { revalidatePath } from "next/cache";

import { CheckoutAddLineDocument } from "@/gql/graphql";
import * as Checkout from "@/lib/checkout";
import { executePublicGraphQL } from "@/lib/graphql";

/** Returned to `useActionState` — safe to serialize */
export type AddProductToCartState =
	| { ok: true }
	| { ok: false; reason: string; detail?: string }
	| null;

export async function addProductToCartAction(
	_prevState: AddProductToCartState,
	formData: FormData,
): Promise<AddProductToCartState> {
	const channel = String(formData.get("channel") ?? "").trim();
	const variantRaw = String(formData.get("variantId") ?? "").trim();

	if (!channel || !variantRaw) {
		console.warn("Add to cart: missing channel or variantId in form data");
		return { ok: false, reason: "missing-variant" };
	}

	let productVariantId: string;
	try {
		productVariantId = decodeURIComponent(variantRaw);
	} catch (e) {
		console.error("Add to cart: invalid variantId encoding", e);
		return { ok: false, reason: "bad-variant-encoding" };
	}

	try {
		const checkout = await Checkout.findOrCreate({
			checkoutId: await Checkout.getIdFromCookies(channel),
			channel,
		});

		if (!checkout) {
			console.error("Add to cart: failed to create or load checkout");
			return { ok: false, reason: "no-checkout" };
		}

		await Checkout.saveIdToCookie(channel, checkout.id);

		const addResult = await executePublicGraphQL(CheckoutAddLineDocument, {
			variables: {
				id: checkout.id,
				productVariantId,
			},
			cache: "no-store",
		});

		if (!addResult.ok) {
			console.error("Add to cart: GraphQL request failed:", addResult.error.message);
			return { ok: false, reason: "graphql-failed" };
		}

		const linePayload = addResult.data.checkoutLinesAdd;
		const saleorErrors = linePayload?.errors ?? [];
		if (saleorErrors.length) {
			const msg = saleorErrors.map((e) => e.message).filter(Boolean).join("; ");
			console.error("Add to cart: checkoutLinesAdd errors:", msg);
			return { ok: false, reason: "saleor-rejected", detail: msg };
		}

		const lineCount = linePayload?.checkout?.lines?.length ?? 0;
		if (lineCount < 1) {
			console.error(
				"Add to cart: checkoutLinesAdd returned checkout with empty lines (id=%s, variant=%s)",
				checkout.id,
				productVariantId,
			);
			return { ok: false, reason: "empty-lines-response" };
		}

		revalidatePath(`/${channel}`, "layout");
		revalidatePath(`/${channel}/cart`);

		return { ok: true };
	} catch (error) {
		console.error("Add to cart failed:", error);
		return { ok: false, reason: "exception" };
	}
}
