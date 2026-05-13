/**
 * ToyVerse demo catalog — category slugs / collections must match Saleor seed data.
 */

export const TOYVERSE_CATEGORY_SLUGS_ORDER = [
	"educational-toys",
	"baby-toys",
	"action-figures",
	"dolls",
	"board-games",
	"outdoor-toys",
	"arts-crafts",
	"remote-control-toys",
] as const;

export type ToyverseCategorySlug = (typeof TOYVERSE_CATEGORY_SLUGS_ORDER)[number];

/** Gradient backgrounds for category tiles when Saleor has no category image */
export const TOYVERSE_CATEGORY_CARD_GRADIENT: Record<ToyverseCategorySlug, string> = {
	"educational-toys": "linear-gradient(135deg, #7c3aed 0%, #a855f7 55%, #e879f9 100%)",
	"baby-toys": "linear-gradient(135deg, #38bdf8 0%, #818cf8 100%)",
	"action-figures": "linear-gradient(135deg, #f97316 0%, #ef4444 100%)",
	dolls: "linear-gradient(135deg, #ec4899 0%, #f472b6 55%, #fda4af 100%)",
	"board-games": "linear-gradient(135deg, #22c55e 0%, #14b8a6 100%)",
	"outdoor-toys": "linear-gradient(135deg, #84cc16 0%, #eab308 100%)",
	"arts-crafts": "linear-gradient(135deg, #f59e0b 0%, #fb923c 100%)",
	"remote-control-toys": "linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)",
};

export const TOYVERSE_COLLECTION_SLUGS = {
	featured: "featured-products",
	bestSellers: "best-sellers",
} as const;

export type ToyverseHeroSlide = {
	title: string;
	subtitle: string;
	href: string;
	ctaLabel: string;
	background: string;
};

/** Paths relative to channel root — LinkWithChannel adds /{channel} prefix */
export const TOYVERSE_HERO_SLIDES: ToyverseHeroSlide[] = [
	{
		title: "Discover joyful learning toys",
		subtitle: "STEM kits, puzzles, and imagination-building picks for curious kids.",
		href: "/categories/educational-toys",
		ctaLabel: "Shop educational",
		background: "linear-gradient(115deg, #5b21b6 0%, #c026d3 45%, #fb923c 100%)",
	},
	{
		title: "Outdoor adventures await",
		subtitle: "Scooters, sports sets, and sunny-day favorites.",
		href: "/categories/outdoor-toys",
		ctaLabel: "Play outside",
		background: "linear-gradient(115deg, #0369a1 0%, #22c55e 55%, #fde047 100%)",
	},
	{
		title: "Cozy picks for little ones",
		subtitle: "Soft plush, rattles, and sensory-safe baby essentials.",
		href: "/categories/baby-toys",
		ctaLabel: "Baby boutique",
		background: "linear-gradient(115deg, #db2777 0%, #a855f7 50%, #93c5fd 100%)",
	},
];
