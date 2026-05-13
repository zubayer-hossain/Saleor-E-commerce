import { cookies } from "next/headers";
import { CheckoutCreateDocument, CheckoutFindDocument } from "@/gql/graphql";
import { executePublicGraphQL } from "@/lib/graphql";

/** Checkout mutations do not require a customer JWT; using the public executor avoids expired/invalid tokens breaking the cart for guests and logged-in users. */

export async function getIdFromCookies(channel: string) {
	try {
		const cookieName = `checkoutId-${channel}`;
		const checkoutId = (await cookies()).get(cookieName)?.value || "";
		return checkoutId;
	} catch {
		// During static generation, cookies() throws - return empty string
		return "";
	}
}

export async function saveIdToCookie(channel: string, checkoutId: string) {
	const shouldUseHttps =
		process.env.NEXT_PUBLIC_STOREFRONT_URL?.startsWith("https") || !!process.env.NEXT_PUBLIC_VERCEL_URL;
	const cookieName = `checkoutId-${channel}`;
	(await cookies()).set(cookieName, checkoutId, {
		path: "/",
		sameSite: "lax",
		secure: shouldUseHttps,
		maxAge: 60 * 60 * 24 * 90,
	});
}

export async function clearCheckoutCookie(channel: string) {
	const cookieName = `checkoutId-${channel}`;
	(await cookies()).delete(cookieName);
}

export async function find(checkoutId: string) {
	if (!checkoutId) {
		return null;
	}

	const result = await executePublicGraphQL(CheckoutFindDocument, {
		variables: { id: checkoutId },
		cache: "no-store",
	});

	// Return null on error or if checkout not found
	return result.ok ? result.data.checkout : null;
}

export async function findOrCreate({ channel, checkoutId }: { checkoutId?: string; channel: string }) {
	if (!checkoutId) {
		const result = await create({ channel });
		return checkoutFromCreateResult(result);
	}

	const checkout = await find(checkoutId);
	if (checkout) {
		return checkout;
	}

	const result = await create({ channel });
	return checkoutFromCreateResult(result);
}

function checkoutFromCreateResult(result: Awaited<ReturnType<typeof create>>) {
	if (!result.ok) {
		return null;
	}
	const payload = result.data.checkoutCreate;
	if (payload?.errors?.length) {
		console.error(
			"checkoutCreate errors:",
			payload.errors.map((e) => `${e.code ?? "?"} @${e.field ?? "?"}`).join("; "),
		);
		return null;
	}
	return payload?.checkout ?? null;
}

export const create = ({ channel }: { channel: string }) =>
	executePublicGraphQL(CheckoutCreateDocument, { cache: "no-store", variables: { channel } });
