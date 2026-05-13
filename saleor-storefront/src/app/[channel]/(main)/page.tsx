import { Suspense } from "react";

import { brandConfig } from "@/config/brand";
import { getSaleorLanguageCode } from "@/lib/saleor-language.server";
import { ToyverseHeroCarousel } from "@/ui/components/home/toyverse-hero";
import { ShopByCategorySection } from "@/ui/components/home/shop-by-category-section";
import {
	ToyverseBestSellersSection,
	ToyverseFeaturedProductsSection,
} from "@/ui/components/home/home-collection-sections";
import { ToyversePromoStrip } from "@/ui/components/home/toyverse-promo-strip";
import { ToyverseNewsletterSection } from "@/ui/components/home/toyverse-newsletter";
import { ToyverseTestimonialsSection } from "@/ui/components/home/toyverse-testimonials";

export const metadata = {
	title: brandConfig.siteName,
	description: brandConfig.description,
};

function ProductGridSkeleton({ count = 8 }: { count?: number }) {
	return (
		<ul
			role="list"
			data-testid="ProductList"
			className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3"
		>
			{Array.from({ length: count }).map((_, i) => (
				<li key={i} className="animate-pulse rounded-2xl border border-border/60 p-2">
					<div className="aspect-square rounded-xl bg-secondary" />
					<div className="mt-4 space-y-2 px-1">
						<div className="h-4 w-3/4 rounded bg-secondary" />
						<div className="h-3 w-1/2 rounded bg-secondary" />
					</div>
				</li>
			))}
		</ul>
	);
}

function CategorySkeleton() {
	return (
		<ul className="grid animate-pulse grid-cols-2 gap-4 md:grid-cols-4">
			{Array.from({ length: 8 }).map((_, i) => (
				<li key={i} className="aspect-[4/3] rounded-2xl bg-secondary" />
			))}
		</ul>
	);
}

async function ShopByCategoryLoader({ params }: { params: Promise<{ channel: string }> }) {
	const { channel } = await params;
	const languageCode = await getSaleorLanguageCode();
	return <ShopByCategorySection channel={channel} languageCode={languageCode} />;
}

async function FeaturedLoader({ params }: { params: Promise<{ channel: string }> }) {
	const { channel } = await params;
	return <ToyverseFeaturedProductsSection channel={channel} />;
}

async function BestSellersLoader({ params }: { params: Promise<{ channel: string }> }) {
	const { channel } = await params;
	return <ToyverseBestSellersSection channel={channel} />;
}

async function PromoLoader({ params }: { params: Promise<{ channel: string }> }) {
	const { channel } = await params;
	return <ToyversePromoStrip channel={channel} />;
}

/**
 * ToyVerse homepage — hero carousel, collections, categories, promos, newsletter, testimonials.
 * Product rows remain wired to Saleor collections (`featured-products`, `best-sellers`).
 */
export default function Page(props: { params: Promise<{ channel: string }> }) {
	return (
		<>
			<ToyverseHeroCarousel />
			<div className="mx-auto max-w-7xl space-y-16 px-4 py-14 pb-24 sm:px-6 lg:space-y-20 lg:px-8">
				<Suspense fallback={<ProductGridSkeleton count={6} />}>
					<FeaturedLoader params={props.params} />
				</Suspense>

				<Suspense fallback={<CategorySkeleton />}>
					<ShopByCategoryLoader params={props.params} />
				</Suspense>

				<Suspense fallback={<ProductGridSkeleton count={6} />}>
					<BestSellersLoader params={props.params} />
				</Suspense>

				<Suspense fallback={<div className="h-40 animate-pulse rounded-3xl bg-secondary" />}>
					<PromoLoader params={props.params} />
				</Suspense>

				<ToyverseNewsletterSection />

				<ToyverseTestimonialsSection />
			</div>
		</>
	);
}
