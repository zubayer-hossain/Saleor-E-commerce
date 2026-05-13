/**
 * Shared Logo Component
 *
 * ToyVerse wordmark — SVGs in /public (logo.svg + logo-dark.svg).
 */

interface LogoProps {
	className?: string;
	ariaLabel?: string;
	inverted?: boolean;
}

export const Logo = ({ className, ariaLabel, inverted = false }: LogoProps) => {
	const lightModeLogo = inverted ? "/logo-dark.svg" : "/logo.svg";
	const darkModeLogo = inverted ? "/logo.svg" : "/logo-dark.svg";

	const baseStyles = "aspect-[188/36]";

	return (
		<>
			{/* eslint-disable-next-line @next/next/no-img-element */}
			<img
				src={lightModeLogo}
				alt={ariaLabel ?? ""}
				width={188}
				height={36}
				className={`dark:hidden ${baseStyles} ${className ?? ""}`}
			/>
			{/* eslint-disable-next-line @next/next/no-img-element */}
			<img
				src={darkModeLogo}
				alt={ariaLabel ?? ""}
				width={188}
				height={36}
				className={`hidden dark:block ${baseStyles} ${className ?? ""}`}
			/>
		</>
	);
};
