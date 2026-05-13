import Link from "next/link";
import { LinkWithChannel } from "../atoms/link-with-channel";
import { ChannelSelect } from "./channel-select";
import { ChannelsListDocument, MenuGetBySlugDocument } from "@/gql/graphql";
import { executePublicGraphQL } from "@/lib/graphql";
import { CACHE_PROFILES, applyCacheProfile } from "@/lib/cache-manifest";
import { CopyrightText } from "./copyright-text";
import { Logo } from "./shared/logo";
import { brandConfig } from "@/config/brand";
import { getSaleorLanguageCode } from "@/lib/saleor-language.server";
import { type SaleorLanguageCode, asGraphQLLanguageCode } from "@/lib/saleor-language";

// Default footer links when Saleor footer menu is empty (demo toy shop)
const defaultFooterLinks = {
	support: [
		{ label: "Shipping to Bahrain & UAE", href: "/shipping" },
		{ label: "Returns & safety", href: "/returns" },
		{ label: "FAQs", href: "/faq" },
		{ label: "Contact", href: "/contact" },
	],
	company: [
		{ label: "About ToyVerse", href: "/about" },
		{ label: "Gift ideas", href: "/products" },
	],
};

/** Cached channels list - rarely changes */
async function getChannels() {
	"use cache";
	applyCacheProfile(CACHE_PROFILES.channels);

	if (!process.env.SALEOR_APP_TOKEN) {
		return null;
	}

	const result = await executePublicGraphQL(ChannelsListDocument, {
		headers: {
			Authorization: `Bearer ${process.env.SALEOR_APP_TOKEN}`,
		},
	});

	return result.ok ? result.data : null;
}

/** Cached footer menu */
async function getFooterMenu(channel: string, languageCode: SaleorLanguageCode) {
	"use cache";
	applyCacheProfile(CACHE_PROFILES.footerMenu);

	const result = await executePublicGraphQL(MenuGetBySlugDocument, {
		variables: { slug: "footer", channel, languageCode: asGraphQLLanguageCode(languageCode) },
		revalidate: 60 * 60 * 24,
	});

	return result.ok ? result.data : null;
}

export async function Footer({ channel }: { channel: string }) {
	const languageCode = await getSaleorLanguageCode();
	const [footerLinks, channels] = await Promise.all([getFooterMenu(channel, languageCode), getChannels()]);

	const menuItems = footerLinks?.menu?.items || [];

	return (
		<footer className="relative overflow-hidden bg-[oklch(0.22_0.06_290)] text-background">
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(167,139,250,0.35),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(251,146,60,0.22),transparent_50%)]" />
			{/* Extra bottom padding on mobile to account for sticky add-to-cart bar */}
			<div className="relative mx-auto max-w-7xl px-4 pb-24 pt-12 sm:px-6 sm:pb-12 lg:px-8 lg:py-16">
				<div className="grid grid-cols-2 gap-8 md:grid-cols-4 lg:gap-12">
					{/* Brand */}
					<div className="col-span-2 md:col-span-1">
						<Link href={`/${channel}`} prefetch={false} className="mb-4 inline-block">
							<Logo className="h-8 w-auto" inverted ariaLabel={brandConfig.logoAriaLabel} />
						</Link>
						<p className="mt-4 max-w-xs text-sm leading-relaxed text-violet-200/90">
							{brandConfig.tagline}. Premium toy finds with cheerful delivery across Bahrain &amp; the UAE.
						</p>
					</div>

					{/* Dynamic menu items from Saleor CMS */}
					{menuItems.map((item) => (
						<div key={item.id}>
							<h4 className="mb-4 text-sm font-semibold text-violet-100">
								{item.translation?.name ?? item.name}
							</h4>
							<ul className="space-y-3">
								{item.children?.map((child) => {
									if (child.category) {
										const catLabel = child.category.translation?.name ?? child.category.name;
										return (
											<li key={child.id}>
												<LinkWithChannel
													href={`/categories/${child.category.slug}`}
													prefetch={false}
													className="text-sm text-violet-200/85 transition-colors hover:text-white"
												>
													{catLabel}
												</LinkWithChannel>
											</li>
										);
									}
									if (child.collection) {
										const colLabel = child.collection.translation?.name ?? child.collection.name;
										return (
											<li key={child.id}>
												<LinkWithChannel
													href={`/collections/${child.collection.slug}`}
													prefetch={false}
													className="text-sm text-violet-200/85 transition-colors hover:text-white"
												>
													{colLabel}
												</LinkWithChannel>
											</li>
										);
									}
									if (child.page) {
										const pageTitle = child.page.translation?.title ?? child.page.title;
										return (
											<li key={child.id}>
												<LinkWithChannel
													href={`/pages/${child.page.slug}`}
													prefetch={false}
													className="text-sm text-violet-200/85 transition-colors hover:text-white"
												>
													{pageTitle}
												</LinkWithChannel>
											</li>
										);
									}
									if (child.url) {
										const linkLabel = child.translation?.name ?? child.name;
										return (
											<li key={child.id}>
												<LinkWithChannel
													href={child.url}
													prefetch={false}
													className="text-sm text-violet-200/85 transition-colors hover:text-white"
												>
													{linkLabel}
												</LinkWithChannel>
											</li>
										);
									}
									return null;
								})}
							</ul>
						</div>
					))}

					{/* Static Support links (if no CMS data) */}
					{menuItems.length === 0 && (
						<>
							<div>
								<h4 className="mb-4 text-sm font-semibold text-violet-100">Support</h4>
								<ul className="space-y-3">
									{defaultFooterLinks.support.map((link) => (
										<li key={link.href}>
											<Link
												href={link.href}
												prefetch={false}
												className="text-sm text-violet-200/85 transition-colors hover:text-white"
											>
												{link.label}
											</Link>
										</li>
									))}
								</ul>
							</div>
							<div>
								<h4 className="mb-4 text-sm font-semibold text-violet-100">ToyVerse</h4>
								<ul className="space-y-3">
									{defaultFooterLinks.company.map((link) => (
										<li key={link.href}>
											<Link
												href={link.href}
												prefetch={false}
												className="text-sm text-violet-200/85 transition-colors hover:text-white"
											>
												{link.label}
											</Link>
										</li>
									))}
								</ul>
							</div>
						</>
					)}
				</div>

				{/* Channel selector */}
				{channels?.channels && (
					<div className="mt-8 text-violet-200/90">
						<label className="flex flex-wrap items-center gap-2 text-sm">
							<span>Shopping channel / currency:</span>
							<ChannelSelect channels={channels.channels} />
						</label>
					</div>
				)}

				{/* Bottom bar */}
				<div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 sm:flex-row">
					<p className="text-xs text-violet-300/80">
						<CopyrightText />
					</p>
					<div className="flex items-center gap-6">
						<Link
							href="/privacy"
							prefetch={false}
							className="text-xs text-violet-300/80 transition-colors hover:text-white"
						>
							Privacy Policy
						</Link>
						<Link
							href="/terms"
							prefetch={false}
							className="text-xs text-violet-300/80 transition-colors hover:text-white"
						>
							Terms of Service
						</Link>
					</div>
				</div>
			</div>
		</footer>
	);
}
