"use client";

import { usePathname } from "next/navigation";
import { ChevronDown, Check } from "lucide-react";

import { setSaleorLanguageAction } from "@/actions/set-saleor-language";
import { SALEOR_LANGUAGE_OPTIONS, type SaleorLanguageCode } from "@/lib/saleor-language";
import { cn } from "@/lib/utils";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/ui/components/ui/dropdown-menu";
import { SaleorLanguageFlag } from "./saleor-language-flag";

type Props = {
	currentCode: SaleorLanguageCode;
	className?: string;
};

export function LanguageSwitcher({ currentCode, className }: Props) {
	const pathname = usePathname() ?? "/";
	const selected =
		SALEOR_LANGUAGE_OPTIONS.find((o) => o.code === currentCode) ?? SALEOR_LANGUAGE_OPTIONS[0];

	async function selectLanguage(code: SaleorLanguageCode) {
		if (code === currentCode) return;
		const fd = new FormData();
		fd.set("languageCode", code);
		fd.set("redirectTo", pathname);
		await setSaleorLanguageAction(fd);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className={cn(
						"flex h-9 max-w-[15rem] items-center gap-2 rounded-md border border-input bg-background px-2 text-sm text-foreground shadow-sm outline-none transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring",
						className,
					)}
					aria-label={`Language: ${selected.label}`}
				>
					<SaleorLanguageFlag code={selected.flagCountryCode} />
					<span className="min-w-0 flex-1 truncate text-left">{selected.label}</span>
					<ChevronDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-[var(--radix-dropdown-menu-trigger-width)]">
				{SALEOR_LANGUAGE_OPTIONS.map((opt) => (
					<DropdownMenuItem
						key={opt.code}
						className="relative flex cursor-pointer items-center gap-2 py-2 pr-8"
						onSelect={() => void selectLanguage(opt.code)}
					>
						<SaleorLanguageFlag code={opt.flagCountryCode} />
						<span className="flex-1">{opt.label}</span>
						{opt.code === currentCode ?
							<Check className="absolute right-2 h-4 w-4 text-foreground" aria-hidden />
						:	null}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
