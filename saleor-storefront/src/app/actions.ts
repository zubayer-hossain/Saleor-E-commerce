"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getServerAuthClient } from "@/lib/auth/server";
import * as Checkout from "@/lib/checkout";
import { DefaultChannelSlug } from "@/app/config";

export async function logout() {
	"use server";
	(await getServerAuthClient()).signOut();

	const headersList = await headers();
	const pathname = headersList.get("x-pathname") ?? "";
	const channel =
		pathname.split("/").filter(Boolean)[0] ?? DefaultChannelSlug ?? null;

	if (channel) {
		redirect(`/${channel}/login`);
	}
	redirect("/");
}

/**
 * Clear the checkout cookie after a successful order.
 * Call this after checkoutComplete succeeds.
 */
export async function clearCheckout(channel: string) {
	"use server";
	await Checkout.clearCheckoutCookie(channel);
}
