import Link from "next/link";

import {
	TOYVERSE_CATEGORY_CARD_GRADIENT,
	TOYVERSE_CATEGORY_SLUGS_ORDER,
	type ToyverseCategorySlug,
} from "@/config/toyverse-catalog";
import { type SaleorLanguageCode, asGraphQLLanguageCode } from "@/lib/saleor-language";
import { executeRawGraphQL } from "@/lib/graphql";
import { HomeSectionHeader } from "./home-section-header";

const HOME_CATEGORIES_QUERY = /* GraphQL */ `
	query HomeCategoriesBySlug($slugs: [String!]!, $first: Int!, $languageCode: LanguageCodeEnum!) {
		categories(filter: { slugs: $slugs }, first: $first) {
			edges {
				node {
					id
					slug
					name
					backgroundImage {
						url
						alt
					}
					translation(languageCode: $languageCode) {
						name
					}
				}
			}
		}
	}
`;

type CategoriesPayload = {
	categories?: {
		edges: Array<{
			node: {
				id: string;
				slug: string;
				name: string;
				backgroundImage?: { url: string; alt?: string | null } | null;
				translation?: { name: string } | null;
			};
		}>;
	};
};

export async function ShopByCategorySection({
	channel,
	languageCode,
}: {
	channel: string;
	languageCode: SaleorLanguageCode;
}) {
	const result = await executeRawGraphQL<CategoriesPayload>({
		query: HOME_CATEGORIES_QUERY,
		variables: {
			slugs: [...TOYVERSE_CATEGORY_SLUGS_ORDER],
			first: 24,
			languageCode: asGraphQLLanguageCode(languageCode),
		},
	});

	const edges = result.ok ? result.data.categories?.edges ?? [] : [];
	const bySlug = new Map(edges.map((e) => [e.node.slug, e.node]));

	const encoded = encodeURIComponent(channel);

	return (
		<section aria-labelledby="shop-by-category-heading">
			<HomeSectionHeader
				id="shop-by-category-heading"
				channel={channel}
				title="Shop by category"
				subtitle="Eight playful aisles — from STEAM learning to outdoor adventures."
				viewAllHref="/products"
				viewAllLabel="Browse everything"
			/>
			<ul className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-5 lg:gap-6">
				{TOYVERSE_CATEGORY_SLUGS_ORDER.map((slug) => {
					const node = bySlug.get(slug);
					const displayName = node?.translation?.name || node?.name || slugToFallbackTitle(slug);
					const img = node?.backgroundImage?.url;
					const gradient =
						TOYVERSE_CATEGORY_CARD_GRADIENT[slug as ToyverseCategorySlug] ??
						"linear-gradient(135deg, #6366f1 0%, #a855f7 100%)";

					return (
						<li key={slug}>
							<Link
								href={`/${encoded}/categories/${encodeURIComponent(slug)}`}
								prefetch={false}
								className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
							>
								<div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border/60 bg-card shadow-md ring-1 ring-black/[0.04] transition duration-300 hover:-translate-y-1 hover:border-primary/25 hover:shadow-xl">
									{img ?
										<>
											{/* eslint-disable-next-line @next/next/no-img-element */}
											<img
												src={img}
												alt={node?.backgroundImage?.alt || displayName}
												className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
											/>
											<div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/20 to-transparent" />
										</>
									:	<div
											className="absolute inset-0"
											style={{ background: gradient }}
										/>
									}
									{!img ?
										<div className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />
									:	null}
									<p className="font-display absolute bottom-3 left-3 right-3 text-lg font-bold leading-snug text-white drop-shadow md:text-xl">
										{displayName}
									</p>
								</div>
							</Link>
						</li>
					);
				})}
			</ul>
		</section>
	);
}

function slugToFallbackTitle(slug: string): string {
	return slug
		.split("-")
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
}
