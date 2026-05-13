import { ProductList } from "@/ui/components/product-list";
import { TOYVERSE_COLLECTION_SLUGS } from "@/config/toyverse-catalog";
import { getSaleorLanguageCode } from "@/lib/saleor-language.server";
import { getCollectionProductsForHome } from "@/lib/toyverse-home-products";
import { HomeSectionHeader } from "./home-section-header";

export async function ToyverseFeaturedProductsSection({ channel }: { channel: string }) {
	const languageCode = await getSaleorLanguageCode();
	const products = await getCollectionProductsForHome(
		TOYVERSE_COLLECTION_SLUGS.featured,
		channel,
		languageCode,
		12,
	);

	if (products.length === 0) return null;

	return (
		<section aria-labelledby="featured-heading">
			<HomeSectionHeader
				id="featured-heading"
				channel={channel}
				title="Featured picks"
				subtitle="Staff favorites new parents love — safe materials, smart design."
				viewAllHref={`/collections/${TOYVERSE_COLLECTION_SLUGS.featured}`}
				viewAllLabel="Shop featured"
			/>
			<ProductList products={products} className="gap-6 sm:gap-8 lg:gap-10" />
		</section>
	);
}

export async function ToyverseBestSellersSection({ channel }: { channel: string }) {
	const languageCode = await getSaleorLanguageCode();
	const products = await getCollectionProductsForHome(
		TOYVERSE_COLLECTION_SLUGS.bestSellers,
		channel,
		languageCode,
		8,
	);

	if (products.length === 0) return null;

	return (
		<section aria-labelledby="bestsellers-heading">
			<HomeSectionHeader
				id="bestsellers-heading"
				channel={channel}
				title="Best sellers"
				subtitle="Our most-loved toys this season across Bahrain &amp; the UAE."
				viewAllHref={`/collections/${TOYVERSE_COLLECTION_SLUGS.bestSellers}`}
				viewAllLabel="See best sellers"
			/>
			<ProductList products={products} className="gap-6 sm:gap-8 lg:gap-10" />
		</section>
	);
}
