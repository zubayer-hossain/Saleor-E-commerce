"use client";

import { type ReactNode } from "react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/ui/components/ui/tooltip";

export function RootProviders({ children }: { children: ReactNode }) {
	return (
		<TooltipProvider delayDuration={350} skipDelayDuration={150}>
			{children}
			<Toaster richColors closeButton position="top-center" />
		</TooltipProvider>
	);
}
