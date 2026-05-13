import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ProductListPaginatedDocument, CategoriesForProductsFilterDocument } from "@/gql/graphql";
import { executePublicGraphQL } from "@/lib/graphql";
import { getPaginatedListVariables } from "@/lib/utils";
import { CategoryHero, transformToProductCard } from "@/ui/components/plp";
import { buildSortVariables, buildFilterVariables, type CategoryOption } from "@/ui/components/plp/filter-utils";
import { resolveCategorySlugsToIds } from "@/ui/components/plp/filter-utils.server";
import { ProductsPageClient } from "./products-client";
import { getSaleorLanguageCode } from "@/lib/saleor-language.server";
import { asGraphQLLanguageCode } from "@/lib/saleor-language";
import { brandConfig } from "@/config/brand";
import { productsPageCatalogCopy } from "@/config/catalog-i18n";

export const metadata = {
	title: `Toy catalog · ${brandConfig.siteName}`,
	description: `Browse ${brandConfig.siteName} toys — dolls, STEAM kits, outdoor play, and gifts with multilingual support.`,
};

type PageProps = {
	params: Promise<{ channel: string }>;
	searchParams: Promise<{
		cursor?: string | string[];
		direction?: string | string[];
		sort?: string;
		price?: string;
		colors?: string;
		sizes?: string;
		categories?: string;
	}>;
};

/**
 * Products page with Cache Components.
 * Static shell (hero) renders immediately, product grid streams in.
 */
export default async function Page(props: PageProps) {
	const params = await props.params;
	const languageCode = await getSaleorLanguageCode();
	const catalogCopy = productsPageCatalogCopy[languageCode];

	const breadcrumbs = [
		{ label: catalogCopy.breadcrumbHome, href: `/${params.channel}` },
		{ label: catalogCopy.breadcrumbProducts, href: `/${params.channel}/products` },
	];

	return (
		<>
			{/* Static shell - renders immediately */}
			<CategoryHero
				title={catalogCopy.heroTitle}
				description={catalogCopy.heroDescription}
				breadcrumbs={breadcrumbs}
			/>
			{/* Dynamic content - streams in via Suspense */}
			<Suspense fallback={<ProductsGridSkeleton />}>
				<ProductsContent params={props.params} searchParams={props.searchParams} />
			</Suspense>
		</>
	);
}

/**
 * Dynamic products content - reads searchParams at request time.
 */
async function ProductsContent({
	params: paramsPromise,
	searchParams: searchParamsPromise,
}: {
	params: Promise<{ channel: string }>;
	searchParams: PageProps["searchParams"];
}) {
	const [params, searchParams] = await Promise.all([paramsPromise, searchParamsPromise]);
	const languageCode = await getSaleorLanguageCode();

	const paginationVariables = getPaginatedListVariables({ params: searchParams });
	const sortBy = buildSortVariables(searchParams.sort);

	// Parse category slugs from URL and resolve to IDs for server-side filtering
	const categorySlugs = searchParams.categories?.split(",").filter(Boolean) || [];
	const categoryMap = await resolveCategorySlugsToIds(categorySlugs, languageCode);
	const categoryIds = Array.from(categoryMap.values()).map((c) => c.id);

	const categoriesFilterResult = await executePublicGraphQL(CategoriesForProductsFilterDocument, {
		variables: { first: 50, languageCode: asGraphQLLanguageCode(languageCode) },
		revalidate: 300,
	});

	const catalogCategoryRows = categoriesFilterResult.ok ? categoriesFilterResult.data.categories?.edges : undefined;

	const catalogCategoriesForFilter: CategoryOption[] =
		catalogCategoryRows?.map(({ node }) => ({
			id: node.id,
			slug: node.slug,
			name: node.translation?.name ?? node.name,
			count: 0,
		})) ?? [];

	const filter = buildFilterVariables({
		priceRange: searchParams.price,
		categoryIds,
	});

	const result = await executePublicGraphQL(ProductListPaginatedDocument, {
		variables: {
			...paginationVariables,
			channel: params.channel,
			languageCode: asGraphQLLanguageCode(languageCode),
			sortBy,
			filter,
		},
		revalidate: 300,
	});

	if (!result.ok || !result.data.products) {
		notFound();
	}

	const products = result.data.products;
	const productCards = products.edges.map((e) => transformToProductCard(e.node, params.channel));

	// Build resolved categories array for the client (for active filter display)
	const resolvedCategories = categorySlugs
		.map((slug) => {
			const cat = categoryMap.get(slug);
			return cat ? { slug, id: cat.id, name: cat.name } : null;
		})
		.filter(Boolean) as { slug: string; id: string; name: string }[];

	return (
		<ProductsPageClient
			products={productCards}
			pageInfo={products.pageInfo}
			totalCount={products.totalCount ?? productCards.length}
			resolvedCategories={resolvedCategories}
			catalogCategories={catalogCategoriesForFilter}
		/>
	);
}

/**
 * Products grid skeleton with delayed visibility.
 * Matches ProductGrid/ProductCard dimensions to prevent layout shift.
 */
function ProductsGridSkeleton() {
	return (
		<div className="mx-auto max-w-7xl animate-skeleton-delayed px-4 py-8 opacity-0 sm:px-6 lg:px-8">
			{/* Matches ProductGrid: grid-cols-2 lg:grid-cols-3 */}
			<div className="grid grid-cols-2 gap-4 lg:grid-cols-3 lg:gap-6">
				{Array.from({ length: 6 }).map((_, i) => (
					<div key={i} className="animate-pulse">
						{/* Matches ProductCard: aspect-[3/4] rounded-xl */}
						<div className="mb-4 aspect-[3/4] rounded-xl bg-muted" />
						<div className="space-y-1.5">
							<div className="h-4 w-3/4 rounded bg-muted" />
							<div className="h-4 w-1/2 rounded bg-muted" />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
