/**
 * ToyVerse demo brand configuration.
 * Update these values when customizing for another store.
 */

export const brandConfig = {
	siteName: "ToyVerse",

	copyrightHolder: "ToyVerse Demo",

	organizationName: "ToyVerse",

	defaultBrand: "ToyVerse",

	tagline: "Where Play Meets Imagination",

	description:
		"A playful children's toy shop demo — educational games, dolls, outdoor fun, and gifts shipped across Bahrain and the UAE.",

	logoAriaLabel: "ToyVerse — home",

	titleTemplate: "%s | ToyVerse",

	social: {
		twitter: null as string | null,
		instagram: null as string | null,
		facebook: null as string | null,
	},
} as const;

export function formatPageTitle(title: string): string {
	return brandConfig.titleTemplate.replace("%s", title);
}

export function getCopyrightText(year: number = new Date().getFullYear()): string {
	return `© ${year} ${brandConfig.copyrightHolder}. All rights reserved.`;
}
