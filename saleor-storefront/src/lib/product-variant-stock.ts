/**
 * `?variant=` can survive navigation or deep links; never trust it without
 * checking it belongs to the product on this page.
 */
export function resolveSelectedVariantId(
	variantParam: string | undefined,
	variants: ReadonlyArray<{ id: string }>,
): string | undefined {
	const allowed = new Set(variants.map((v) => v.id));
	const fromUrl = variantParam && allowed.has(variantParam) ? variantParam : undefined;
	if (fromUrl) return fromUrl;
	if (variants.length === 1) return variants[0].id;
	return undefined;
}

/**
 * Saleor storefront: non-tracked variants can have `quantityAvailable: null`
 * while still being purchasable.
 */
export function variantLooksPurchasable(variant: {
	trackInventory?: boolean | null;
	quantityAvailable?: number | null;
}): boolean {
	if (variant.trackInventory === false) return true;
	return (variant.quantityAvailable ?? 0) > 0;
}
