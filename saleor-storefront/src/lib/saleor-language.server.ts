import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";

import {
	DEFAULT_SALEOR_LANGUAGE_CODE,
	resolveSaleorLanguageFromCookie,
	SALEOR_LANGUAGE_COOKIE,
	type SaleorLanguageCode,
} from "@/lib/saleor-language";

/**
 * Cookie-backed language for GraphQL `languageCode` / `translation(languageCode:)`.
 * Cached per request — safe to call from many Server Components.
 */
export const getSaleorLanguageCode = cache(async (): Promise<SaleorLanguageCode> => {
	const jar = await cookies();
	return resolveSaleorLanguageFromCookie(jar.get(SALEOR_LANGUAGE_COOKIE)?.value);
});

/** Use when you must not depend on cookies (e.g. channel layout static paths). */
export function getDefaultSaleorLanguageCode(): SaleorLanguageCode {
	return DEFAULT_SALEOR_LANGUAGE_CODE;
}
