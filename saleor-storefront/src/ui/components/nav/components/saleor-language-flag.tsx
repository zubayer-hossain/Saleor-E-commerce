import type { SaleorFlagCountryCode } from "@/lib/saleor-language";
import { cn } from "@/lib/utils";

const FLAG_SRC: Record<SaleorFlagCountryCode, string> = {
	US: "/flags/us.svg",
	BD: "/flags/bd.svg",
	BH: "/flags/bh.svg",
};

type Props = {
	code: SaleorFlagCountryCode;
	className?: string;
};

/** SVG assets under `/public/flags` — avoids flag emoji (broken on Windows). */
export function SaleorLanguageFlag({ code, className }: Props) {
	return (
		<span
			className={cn(
				"relative inline-flex h-5 w-[1.375rem] shrink-0 overflow-hidden rounded-[3px] border border-border bg-muted shadow-sm",
				className,
			)}
		>
			<img
				src={FLAG_SRC[code]}
				alt=""
				width={22}
				height={16}
				className="h-full w-full object-cover"
				decoding="async"
				loading="lazy"
			/>
		</span>
	);
}
