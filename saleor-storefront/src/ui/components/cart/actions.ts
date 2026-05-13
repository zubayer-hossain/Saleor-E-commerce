"use server";

import { revalidatePath } from "next/cache";
import { executePublicGraphQL } from "@/lib/graphql";
import { CheckoutDeleteLinesDocument, CheckoutLinesUpdateDocument } from "@/gql/graphql";
import * as Checkout from "@/lib/checkout";

function revalidateCartShell(channelSlug: string) {
	revalidatePath(`/${channelSlug}`, "layout");
	revalidatePath(`/${channelSlug}/cart`);
}

export async function deleteCartLine(checkoutId: string, lineId: string) {
	const result = await executePublicGraphQL(CheckoutDeleteLinesDocument, {
		variables: {
			checkoutId,
			lineIds: [lineId],
		},
		cache: "no-store",
	});

	if (result.ok) {
		const deletePayload = result.data.checkoutLinesDelete;
		if (deletePayload?.errors?.length) {
			return;
		}
		const checkout = deletePayload?.checkout;
		const slug = checkout?.channel.slug;
		if (slug && checkout?.lines) {
			revalidateCartShell(slug);
			if (checkout.lines.length === 0) {
				await Checkout.clearCheckoutCookie(slug);
			}
		}
	}
}

export async function updateCartLineQuantity(checkoutId: string, lineId: string, quantity: number, channel: string) {
	if (quantity < 1) {
		return deleteCartLine(checkoutId, lineId);
	}

	const result = await executePublicGraphQL(CheckoutLinesUpdateDocument, {
		variables: {
			checkoutId,
			lines: [{ lineId, quantity }],
		},
		cache: "no-store",
	});

	if (result.ok && !result.data.checkoutLinesUpdate?.errors?.length) {
		revalidateCartShell(channel);
	}
}
