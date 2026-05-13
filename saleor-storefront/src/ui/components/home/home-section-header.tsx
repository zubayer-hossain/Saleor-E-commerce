import Link from "next/link";
import { cn } from "@/lib/utils";

type Props = {
	id?: string;
	title: string;
	subtitle?: string;
	channel: string;
	viewAllHref?: string;
	viewAllLabel?: string;
	className?: string;
};

export function HomeSectionHeader({
	id,
	title,
	subtitle,
	channel,
	viewAllHref,
	viewAllLabel = "View all",
	className,
}: Props) {
	const encoded = encodeURIComponent(channel);
	const href = viewAllHref?.startsWith("/") ? `/${encoded}${viewAllHref}` : viewAllHref;

	return (
		<div className={cn("mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
			<div className="space-y-2">
				<h2
					id={id}
					className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl"
				>
					{title}
				</h2>
				{subtitle ?
					<p className="max-w-2xl text-base text-muted-foreground">{subtitle}</p>
				:	null}
			</div>
			{href ?
				<Link
					href={href}
					prefetch={false}
					className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
				>
					{viewAllLabel}
				</Link>
			:	null}
		</div>
	);
}
