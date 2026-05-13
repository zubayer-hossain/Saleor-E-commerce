/**
 * Shared Saleor storefront language (GraphQL LanguageCodeEnum values).
 * Extend SALEOR_LANGUAGE_OPTIONS when you add translations in Dashboard.
 */

import type { LanguageCodeEnum } from "@/gql/graphql";

export const SALEOR_LANGUAGE_COOKIE = "saleor-language-code";

export const SALEOR_LANGUAGE_OPTIONS = [
	{ code: "EN_US", label: "English (US)", flagCountryCode: "US" },
	{ code: "BN_BD", label: "বাংলা (বাংলাদেশ)", flagCountryCode: "BD" },
	{ code: "AR_BH", label: "العربية (البحرين)", flagCountryCode: "BH" },
	{ code: "AR_AE", label: "العربية (الإمارات)", flagCountryCode: "AE" },
] as const;

export type SaleorFlagCountryCode = (typeof SALEOR_LANGUAGE_OPTIONS)[number]["flagCountryCode"];

export type SaleorLanguageCode = (typeof SALEOR_LANGUAGE_OPTIONS)[number]["code"];

/** Narrow storefront cookie/UI codes for typed GraphQL variables (`LanguageCodeEnum`). */
export function asGraphQLLanguageCode(code: SaleorLanguageCode): LanguageCodeEnum {
	return code as unknown as LanguageCodeEnum;
}

export const DEFAULT_SALEOR_LANGUAGE_CODE: SaleorLanguageCode = "EN_US";

const ALLOWED = new Set<string>(SALEOR_LANGUAGE_OPTIONS.map((o) => o.code));

export function sanitizeSaleorLanguageCode(raw: string): SaleorLanguageCode {
	const normalized = raw.trim().toUpperCase();
	return (ALLOWED.has(normalized) ? normalized : DEFAULT_SALEOR_LANGUAGE_CODE) as SaleorLanguageCode;
}

export function resolveSaleorLanguageFromCookie(value: string | undefined): SaleorLanguageCode {
	if (!value) return DEFAULT_SALEOR_LANGUAGE_CODE;
	return sanitizeSaleorLanguageCode(value);
}
