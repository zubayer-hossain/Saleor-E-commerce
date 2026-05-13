import Link from "next/link";

export function ToyversePromoStrip({ channel }: { channel: string }) {
	const enc = encodeURIComponent(channel);

	return (
		<section aria-label="Limited promotions" className="rounded-3xl shadow-xl ring-1 ring-black/[0.06]">
			<div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-amber-500 px-8 py-10 md:px-12 md:py-12">
				<div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/15 blur-3xl" />
				<div className="pointer-events-none absolute -bottom-10 left-10 h-40 w-40 rounded-full bg-amber-300/30 blur-2xl" />
				<div className="relative flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
					<div className="max-w-xl space-y-3 text-white">
						<p className="text-xs font-semibold uppercase tracking-[0.25em] text-white/90">
							Limited toy drops
						</p>
						<h2 className="font-display text-3xl font-bold leading-tight md:text-4xl">
							Bundle &amp; save on backyard bundles
						</h2>
						<p className="text-lg text-white/90">
							Mix outdoor gear + arts kits — curated bundles ship together across Bahrain &amp; UAE.
						</p>
					</div>
					<div className="flex shrink-0 flex-col gap-3 sm:flex-row md:flex-col lg:flex-row">
						<Link
							href={`/${enc}/collections/featured-products`}
							className="inline-flex items-center justify-center rounded-full bg-white px-8 py-3 text-center text-sm font-bold text-violet-900 shadow-lg transition hover:bg-white/95"
						>
							Featured deals
						</Link>
						<Link
							href={`/${enc}/products`}
							className="inline-flex items-center justify-center rounded-full border-2 border-white/70 bg-transparent px-8 py-3 text-center text-sm font-semibold text-white transition hover:bg-white/10"
						>
							Browse catalog
						</Link>
					</div>
				</div>
			</div>
		</section>
	);
}
