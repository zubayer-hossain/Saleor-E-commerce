const QUOTES = [
	{
		name: "Layla M.",
		local: "Manama",
		text: "Orders arrive fast and everything feels retail-grade. My twins fight over the STEM rocket kit in the best way.",
	},
	{
		name: "Omar K.",
		local: "Dubai",
		text: "Clean checkout, bilingual labels worked perfectly, and support answered sizing questions before I bought the scooter.",
	},
	{
		name: "Priya S.",
		local: "Abu Dhabi",
		text: "ToyVerse bundles saved our rainy weekend — crafts one day, board games the next. Presentation-ready demo shop.",
	},
] as const;

export function ToyverseTestimonialsSection() {
	return (
		<section aria-labelledby="love-heading" className="space-y-8">
			<div className="text-center">
				<h2 id="love-heading" className="font-display text-3xl font-bold text-foreground md:text-4xl">
					Loved by families &amp; demo audiences
				</h2>
				<p className="mt-3 text-muted-foreground">
					Fictional testimonials for presentation polish — swap with real quotes anytime.
				</p>
			</div>
			<ul className="grid gap-6 md:grid-cols-3">
				{QUOTES.map((q) => (
					<li
						key={q.name}
						className="flex flex-col rounded-3xl border border-border/70 bg-card p-6 shadow-sm ring-1 ring-black/[0.03] transition hover:-translate-y-0.5 hover:shadow-md"
					>
						<p className="flex-1 text-base leading-relaxed text-foreground">&ldquo;{q.text}&rdquo;</p>
						<div className="mt-6 border-t border-border/60 pt-4">
							<p className="font-semibold text-foreground">{q.name}</p>
							<p className="text-sm text-muted-foreground">{q.local}</p>
						</div>
					</li>
				))}
			</ul>
		</section>
	);
}
