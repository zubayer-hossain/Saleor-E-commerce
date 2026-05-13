"use client";

import { useCallback, useEffect, useState } from "react";

import { LinkWithChannel } from "@/ui/atoms/link-with-channel";
import { TOYVERSE_HERO_SLIDES } from "@/config/toyverse-catalog";
import {
	Carousel,
	CarouselContent,
	CarouselItem,
	CarouselNext,
	CarouselPrevious,
	type CarouselApi,
	useCarousel,
} from "@/ui/components/ui/carousel";
import { cn } from "@/lib/utils";

function HeroDotsLight() {
	const { selectedIndex, scrollTo, slideCount } = useCarousel();

	if (slideCount <= 1) return null;

	return (
		<div className="mt-6 flex justify-center gap-2 md:mt-8">
			{Array.from({ length: slideCount }).map((_, index) => (
				<button
					key={index}
					type="button"
					onClick={() => scrollTo(index)}
					className={cn(
						"h-2.5 w-2.5 rounded-full transition-all",
						selectedIndex === index ? "w-8 bg-white shadow-sm" : "bg-white/35 hover:bg-white/55",
					)}
					aria-label={`Go to slide ${index + 1}`}
					aria-current={selectedIndex === index ? "true" : undefined}
				/>
			))}
		</div>
	);
}

export function ToyverseHeroCarousel() {
	const [api, setApi] = useState<CarouselApi>();

	const autoplay = useCallback(() => {
		if (!api) return;
		if (!api.canScrollNext()) {
			api.scrollTo(0);
		} else {
			api.scrollNext();
		}
	}, [api]);

	useEffect(() => {
		if (!api) return;
		const interval = setInterval(autoplay, 6200);
		return () => clearInterval(interval);
	}, [api, autoplay]);

	return (
		<section aria-label="Featured highlights" className="w-full px-4 pt-6 sm:px-6 lg:px-8">
			<Carousel className="mx-auto max-w-7xl" opts={{ loop: true }} setApi={setApi}>
				<CarouselContent className="-ml-0">
					{TOYVERSE_HERO_SLIDES.map((slide, index) => (
						<CarouselItem key={`hero-${index}`} className="pl-0">
							<div
								className="relative flex min-h-[min(340px,52vh)] flex-col justify-center overflow-hidden rounded-3xl px-8 py-12 shadow-xl md:min-h-[380px] md:px-14 md:py-16 lg:px-16"
								style={{ background: slide.background }}
							>
								<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.2),transparent_45%),radial-gradient(circle_at_90%_80%,rgba(0,0,0,0.08),transparent_40%)]" />
								<div className="relative max-w-xl space-y-4">
									<p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/85 md:text-sm">
										ToyVerse · {brandShort(index)}
									</p>
									<h1 className="font-display text-balance text-4xl font-bold leading-tight text-white drop-shadow-sm md:text-5xl lg:text-6xl">
										{slide.title}
									</h1>
									<p className="max-w-lg text-lg text-white/90 md:text-xl">{slide.subtitle}</p>
									<div className="pt-2">
										<LinkWithChannel
											href={slide.href}
											className="inline-flex items-center justify-center rounded-full bg-white px-7 py-3 text-sm font-bold text-violet-900 shadow-lg transition-transform hover:scale-[1.02] hover:bg-white/95 active:scale-[0.98]"
										>
											{slide.ctaLabel}
										</LinkWithChannel>
									</div>
								</div>
							</div>
						</CarouselItem>
					))}
				</CarouselContent>
				<CarouselPrevious
					variant="outline-solid"
					className="left-2 border-white/40 bg-white/15 text-white hover:bg-white/25 md:left-4 lg:left-6"
				/>
				<CarouselNext
					variant="outline-solid"
					className="right-2 border-white/40 bg-white/15 text-white hover:bg-white/25 md:right-4 lg:right-6"
				/>
				<HeroDotsLight />
			</Carousel>
		</section>
	);
}

function brandShort(index: number): string {
	const labels = ["New arrivals", "Outdoor play", "Baby & toddler"];
	return labels[index % labels.length];
}
