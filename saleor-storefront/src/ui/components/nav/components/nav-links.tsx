import Link from "next/link";
import { NavLink } from "./nav-link";
import { executePublicGraphQL } from "@/lib/graphql";
import { MenuGetBySlugDocument } from "@/gql/graphql";
import { CACHE_PROFILES, applyCacheProfile } from "@/lib/cache-manifest";
import { getSaleorLanguageCode } from "@/lib/saleor-language.server";
import { type SaleorLanguageCode, asGraphQLLanguageCode } from "@/lib/saleor-language";
import { navChromeCopy } from "@/config/catalog-i18n";

async function CachedNavLinks({ channel, languageCode }: { channel: string; languageCode: SaleorLanguageCode }) {
	"use cache";
	applyCacheProfile(CACHE_PROFILES.navigation);

	const allLabel = navChromeCopy[languageCode].allProducts;

	const result = await executePublicGraphQL(MenuGetBySlugDocument, {
		variables: { slug: "navbar", channel, languageCode: asGraphQLLanguageCode(languageCode) },
		revalidate: 60 * 60, // 1 hour
	});

	if (!result.ok) {
		console.warn(`[NavLinks] Failed to fetch navigation for ${channel}:`, result.error.message);
		return <NavLink href="/products">{allLabel}</NavLink>;
	}

	return (
		<>
			<NavLink href="/products">{allLabel}</NavLink>
			{result.data.menu?.items?.map((item) => {
				if (item.category) {
					const label = item.category.translation?.name ?? item.category.name;
					return (
						<NavLink key={item.id} href={`/categories/${item.category.slug}`}>
							{label}
						</NavLink>
					);
				}
				if (item.collection) {
					const label = item.collection.translation?.name ?? item.collection.name;
					return (
						<NavLink key={item.id} href={`/collections/${item.collection.slug}`}>
							{label}
						</NavLink>
					);
				}
				if (item.page) {
					const title = item.page.translation?.title ?? item.page.title;
					return (
						<NavLink key={item.id} href={`/pages/${item.page.slug}`}>
							{title}
						</NavLink>
					);
				}
				if (item.url) {
					const label = item.translation?.name ?? item.name;
					return (
						<Link key={item.id} href={item.url} prefetch={false}>
							{label}
						</Link>
					);
				}
				return null;
			})}
		</>
	);
}

export async function NavLinks({ channel }: { channel: string }) {
	const languageCode = await getSaleorLanguageCode();
	return <CachedNavLinks channel={channel} languageCode={languageCode} />;
}
