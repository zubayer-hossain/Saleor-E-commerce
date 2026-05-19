"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SALEOR_LANGUAGE_COOKIE, sanitizeSaleorLanguageCode } from "@/lib/saleor-language";

export async function setSaleorLanguageAction(formData: FormData) {
	const code = sanitizeSaleorLanguageCode(String(formData.get("languageCode") ?? ""));
	let redirectTo = String(formData.get("redirectTo") ?? "/");
	if (!redirectTo.startsWith("/") || redirectTo.startsWith("//")) {
		redirectTo = "/";
	}

	const shouldUseHttps =
		process.env.NEXT_PUBLIC_STOREFRONT_URL?.startsWith("https") || !!process.env.NEXT_PUBLIC_VERCEL_URL;

	const jar = await cookies();
	jar.set(SALEOR_LANGUAGE_COOKIE, code, {
		path: "/",
		maxAge: 60 * 60 * 24 * 365,
		sameSite: "lax",
		httpOnly: false,
		secure: shouldUseHttps,
	});

	redirect(redirectTo);
}
