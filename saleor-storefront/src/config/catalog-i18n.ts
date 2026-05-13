import type { SaleorLanguageCode } from "@/lib/saleor-language";

/** /products hero + breadcrumbs — server-rendered from active Saleor language */
export const productsPageCatalogCopy: Record<
	SaleorLanguageCode,
	{ heroTitle: string; heroDescription: string; breadcrumbHome: string; breadcrumbProducts: string }
> = {
	EN_US: {
		heroTitle: "Our toy catalog",
		heroDescription:
			"Bright picks for every age — safe materials, joyful packaging, and speedy Gulf delivery.",
		breadcrumbHome: "Home",
		breadcrumbProducts: "Products",
	},
	BN_BD: {
		heroTitle: "আমাদের খেলনার ক্যাটালগ",
		heroDescription:
			"সব বয়সের জন্য রাঙানো পছন্দ — নিরাপদ উপাদান, আনন্দদায়ক প্যাকেজিং এবং দ্রুত উপসাগরীয় ডেলিভারি।",
		breadcrumbHome: "হোম",
		breadcrumbProducts: "পণ্যসমূহ",
	},
	AR_BH: {
		heroTitle: "كتالوج ألعابنا",
		heroDescription:
			"خيارات مشرقة لكل الأعمار — مواد آمنة، تعبئة مرحة، وتسليم سريع عبر الخليج.",
		breadcrumbHome: "الرئيسية",
		breadcrumbProducts: "المنتجات",
	},
	AR_AE: {
		heroTitle: "كتالوج ألعابنا",
		heroDescription:
			"خيارات مشرقة لكل الأعمار — مواد آمنة، تعبئة مرحة، وتسليم سريع عبر الخليج.",
		breadcrumbHome: "الرئيسية",
		breadcrumbProducts: "المنتجات",
	},
};

export const navChromeCopy: Record<SaleorLanguageCode, { allProducts: string }> = {
	EN_US: { allProducts: "All" },
	BN_BD: { allProducts: "সব" },
	AR_BH: { allProducts: "الكل" },
	AR_AE: { allProducts: "الكل" },
};
