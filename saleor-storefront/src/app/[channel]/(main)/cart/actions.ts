"use server";

import { revalidatePath } from "next/cache";
import { executePublicGraphQL } from "@/lib/graphql";
import { CheckoutDeleteLinesDocument } from "@/gql/graphql";
import * as Checkout from "@/lib/checkout";

type deleteLineFromCheckoutArgs = {
	lineId: string;
	checkoutId: string;
};

export const deleteLineFromCheckout = async ({ lineId, checkoutId }: deleteLineFromCheckoutArgs) => {
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
			revalidatePath(`/${slug}`, "layout");
			revalidatePath(`/${slug}/cart`);
			if (checkout.lines.length === 0) {
				await Checkout.clearCheckoutCookie(slug);
			}
		}
	}
};
