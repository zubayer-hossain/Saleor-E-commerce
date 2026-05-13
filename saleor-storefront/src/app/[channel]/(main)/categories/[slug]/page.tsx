import { Suspense } from "react";
import { notFound } from "next/navigation";
import { type ResolvingMetadata, type Metadata } from "next";
import { ProductListByCategoryDocument, type ProductListByCategoryQuery } from "@/gql/graphql";
import { executePublicGraphQL } from "@/lib/graphql";
import { CACHE_PROFILES, applyCacheProfile } from "@/lib/cache-manifest";
import { getPaginatedListVariables } from "@/lib/utils";
import { parseEditorJSToText } from "@/lib/editorjs";
import { CategoryHero, transformToProductCard } from "@/ui/components/plp";
import { buildSortVariables, buildFilterVariables } from "@/ui/components/plp/filter-utils";
import { CategoryPageClient } from "./client";
import { type SaleorLanguageCode, asGraphQLLanguageCode } from "@/lib/saleor-language";
import { getSaleorLanguageCode } from "@/lib/saleor-language.server";

type CategoryNode = NonNullable<ProductListByCategoryQuery["category"]>;

function mergeLocalizedCategory(category: CategoryNode): CategoryNode {
	const tr = category.translation;
	if (!tr) return category;
	return {
		...category,
		name: tr.name || category.name,
		description: tr.description ?? category.description,
		seoTitle: tr.seoTitle ?? category.seoTitle,
		seoDescription: tr.seoDescription ?? category.seoDescription,
	};
}

async function fetchCategoryHero(
	slug: string,
	channel: string,
	languageCode: SaleorLanguageCode,
	mode: "dynamic" | "cached",
) {
	const result = await executePublicGraphQL(ProductListByCategoryDocument, {
		variables: { slug, channel, languageCode: asGraphQLLanguageCode(languageCode), first: 1 },
		...(mode === "dynamic" ? { cache: "no-store" as const } : { revalidate: 300 }),
	});

	if (!result.ok) {
		console.error(`[getCategoryData] Failed to fetch category ${slug}:`, result.error.message);
		return null;
	}

	const cat = result.data.category;
	if (!cat) return null;
	return mergeLocalizedCategory(cat);
}

async function getCategoryDataCached(slug: string, channel: string, languageCode: SaleorLanguageCode) {
	"use cache";
	applyCacheProfile(CACHE_PROFILES.categories, slug);
	return fetchCategoryHero(slug, channel, languageCode, "cached");
}

async function getCategoryData(slug: string, channel: string) {
	const languageCode = await getSaleorLanguageCode();
	if (process.env.NODE_ENV === "development") {
		return fetchCategoryHero(slug, channel, languageCode, "dynamic");
	}
	return getCategoryDataCached(slug, channel, languageCode);
}

type PageProps = {
	params: Promise<{ slug: string; channel: string }>;
	searchParams: Promise<{
		cursor?: string;
		direction?: string;
		sort?: string;
		price?: string;
		colors?: string;
		sizes?: string;
	}>;
};

export const generateMetadata = async (props: PageProps, parent: ResolvingMetadata): Promise<Metadata> => {
	const params = await props.params;
	const category = await getCategoryData(params.slug, params.channel);
	const plainDescription = parseEditorJSToText(category?.description);

	return {
		title: `${category?.name || "Category"} | ${category?.seoTitle || (await parent).title?.absolute}`,
		description: category?.seoDescription || plainDescription || category?.seoTitle || category?.name,
	};
};

/**
 * Sync page shell with dedicated Suspense boundary.
 * Cached hero + dynamic product grid stream inside this boundary,
 * not through the layout's main Suspense.
 */
export default function Page(props: PageProps) {
	return (
		<Suspense fallback={<PageSkeleton />}>
			<CategoryContent params={props.params} searchParams={props.searchParams} />
		</Suspense>
	);
}

async function CategoryContent({
	params: paramsPromise,
	searchParams,
}: {
	params: PageProps["params"];
	searchParams: PageProps["searchParams"];
}) {
	const params = await paramsPromise;
	const category = await getCategoryData(params.slug, params.channel);

	if (!category) {
		notFound();
	}

	const plainDescription = parseEditorJSToText(category.description);

	const breadcrumbs = [
		{ label: "Home", href: `/${params.channel}` },
		{ label: category.name, href: `/${params.channel}/categories/${params.slug}` },
	];

	return (
		<>
			<CategoryHero
				title={category.name}
				description={plainDescription}
				backgroundImage={category.backgroundImage?.url}
				breadcrumbs={breadcrumbs}
			/>
			<Suspense fallback={<ProductsGridSkeleton />}>
				<CategoryProducts params={paramsPromise} searchParams={searchParams} />
			</Suspense>
		</>
	);
}

async function CategoryProducts({
	params: paramsPromise,
	searchParams: searchParamsPromise,
}: {
	params: PageProps["params"];
	searchParams: PageProps["searchParams"];
}) {
	const [params, searchParams] = await Promise.all([paramsPromise, searchParamsPromise]);
	const languageCode = await getSaleorLanguageCode();

	const paginationVariables = getPaginatedListVariables({ params: searchParams });
	const sortBy = buildSortVariables(searchParams.sort);
	const filter = buildFilterVariables({ priceRange: searchParams.price });

	const result = await executePublicGraphQL(ProductListByCategoryDocument, {
		variables: {
			slug: params.slug,
			channel: params.channel,
			languageCode: asGraphQLLanguageCode(languageCode),
			...paginationVariables,
			sortBy,
			filter,
		},
		revalidate: 300,
	});

	const products = result.ok ? result.data.category?.products : null;
	if (!products) {
		notFound();
	}

	const productCards = products.edges.map((e) => transformToProductCard(e.node, params.channel));

	return (
		<CategoryPageClient
			products={productCards}
			pageInfo={products.pageInfo}
			totalCount={products.totalCount ?? productCards.length}
		/>
	);
}

function PageSkeleton() {
	return (
		<div className="animate-skeleton-delayed opacity-0">
			<div className="bg-muted px-4 py-12 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-7xl">
					<div className="bg-muted-foreground/10 h-8 w-48 animate-pulse rounded" />
					<div className="bg-muted-foreground/10 mt-3 h-4 w-96 max-w-full animate-pulse rounded" />
				</div>
			</div>
			<ProductsGridSkeleton />
		</div>
	);
}

function ProductsGridSkeleton() {
	return (
		<div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
			<div className="grid grid-cols-2 gap-4 lg:grid-cols-3 lg:gap-6">
				{Array.from({ length: 6 }).map((_, i) => (
					<div key={i} className="animate-pulse">
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
