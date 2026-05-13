import { LinkWithChannel } from "../atoms/link-with-channel";
import { ProductImageWrapper } from "@/ui/atoms/product-image-wrapper";

import type { ProductListItemFragment } from "@/gql/graphql";
import { formatMoneyRange } from "@/lib/utils";

export function ProductElement({
	product,
	loading,
	priority,
}: { product: ProductListItemFragment } & { loading: "eager" | "lazy"; priority?: boolean }) {
	const displayName = product.translation?.name || product.name;
	const categoryLabel = product.category?.translation?.name || product.category?.name;

	return (
		<li data-testid="ProductElement">
			<LinkWithChannel href={`/products/${product.slug}`} key={product.id} prefetch={false}>
				<div className="group rounded-2xl border border-border/70 bg-card p-2 pb-4 shadow-sm ring-1 ring-black/[0.03] transition duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg">
					<div className="overflow-hidden rounded-xl bg-muted/40">
						{product?.thumbnail?.url && (
							<ProductImageWrapper
								loading={loading}
								src={product.thumbnail.url}
								alt={product.thumbnail.alt ?? displayName}
								width={512}
								height={512}
								sizes={"512px"}
								priority={priority}
								className="transition duration-500 group-hover:scale-[1.03]"
							/>
						)}
					</div>
					<div className="mt-4 flex justify-between gap-3 px-1">
						<div className="min-w-0">
							<h3 className="line-clamp-2 text-sm font-semibold text-foreground">{displayName}</h3>
							<p className="mt-1 truncate text-xs text-muted-foreground" data-testid="ProductElement_Category">
								{categoryLabel}
							</p>
						</div>
						<p
							className="shrink-0 text-sm font-bold tabular-nums text-primary"
							data-testid="ProductElement_PriceRange"
						>
							{formatMoneyRange({
								start: product?.pricing?.priceRange?.start?.gross,
								stop: product?.pricing?.priceRange?.stop?.gross,
							})}
						</p>
					</div>
				</div>
			</LinkWithChannel>
		</li>
	);
}
