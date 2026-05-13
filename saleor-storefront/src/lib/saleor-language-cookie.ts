import {
	DEFAULT_SALEOR_LANGUAGE_CODE,
	resolveSaleorLanguageFromCookie,
	SALEOR_LANGUAGE_COOKIE,
	type SaleorLanguageCode,
} from "@/lib/saleor-language";

/**
 * Read language cookie in the browser (checkout & client mutations).
 * Cookie must be set with `httpOnly: false` so this matches server-rendered pages.
 */
export function readSaleorLanguageCodeFromDocumentCookie(): SaleorLanguageCode {
	if (typeof document === "undefined") {
		return DEFAULT_SALEOR_LANGUAGE_CODE;
	}
	const row = document.cookie.split("; ").find((r) => r.startsWith(`${SALEOR_LANGUAGE_COOKIE}=`));
	const raw = row?.split("=")[1];
	return resolveSaleorLanguageFromCookie(raw ? decodeURIComponent(raw) : undefined);
}
