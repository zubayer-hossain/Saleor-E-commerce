import { Fredoka } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { type ReactNode } from "react";
import { rootMetadata } from "@/lib/seo";
import { localeConfig } from "@/config/locale";
import { SpeedInsights } from "@vercel/speed-insights/next";

const toyverseDisplay = Fredoka({
	subsets: ["latin"],
	variable: "--font-toyverse-display",
	display: "swap",
});

/**
 * Root metadata for the entire site.
 * Configuration is in src/lib/seo/config.ts
 */
export const metadata = rootMetadata;

export default function RootLayout(props: { children: ReactNode }) {
	const { children } = props;

	return (
		<html
			lang={localeConfig.htmlLang}
			className={`${GeistSans.variable} ${GeistMono.variable} ${toyverseDisplay.variable} min-h-dvh`}
		>
			<body className="min-h-dvh font-sans">
				{children}
				<SpeedInsights />
			</body>
		</html>
	);
}
