import {
	ProductListByCollectionDocument,
	ProductOrderField,
	OrderDirection,
	type ProductListItemFragment,
} from "@/gql/graphql";
import { executePublicGraphQL } from "@/lib/graphql";
import { CACHE_PROFILES, applyCacheProfile } from "@/lib/cache-manifest";
import { type SaleorLanguageCode, asGraphQLLanguageCode } from "@/lib/saleor-language";

async function fetchCollectionProducts(
	slug: string,
	channel: string,
	languageCode: SaleorLanguageCode,
	mode: "dynamic" | "cached",
	first: number,
): Promise<ProductListItemFragment[]> {
	const result = await executePublicGraphQL(ProductListByCollectionDocument, {
		variables: {
			slug,
			channel,
			languageCode: asGraphQLLanguageCode(languageCode),
			first,
			sortBy: { field: ProductOrderField.Collection, direction: OrderDirection.Asc },
		},
		...(mode === "dynamic" ? { cache: "no-store" as const } : { revalidate: 300 }),
	});

	if (!result.ok) {
		console.warn(`[ToyVerse Home] Failed collection "${slug}" for ${channel}:`, result.error.message);
		return [];
	}

	return result.data.collection?.products?.edges.map(({ node }) => node) ?? [];
}

async function getCollectionProductsCached(
	slug: string,
	channel: string,
	languageCode: SaleorLanguageCode,
	first: number,
) {
	"use cache";
	applyCacheProfile(CACHE_PROFILES.collections, slug);
	return fetchCollectionProducts(slug, channel, languageCode, "cached", first);
}

export async function getCollectionProductsForHome(
	slug: string,
	channel: string,
	languageCode: SaleorLanguageCode,
	first: number,
): Promise<ProductListItemFragment[]> {
	if (process.env.NODE_ENV === "development") {
		return fetchCollectionProducts(slug, channel, languageCode, "dynamic", first);
	}
	return getCollectionProductsCached(slug, channel, languageCode, first);
}
