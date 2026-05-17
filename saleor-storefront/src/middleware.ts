import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Forward pathname to Server Components (layouts/actions) for safe redirects
 * after logout and `next=` deep-links back to account pages.
 */
export function middleware(request: NextRequest) {
	const requestHeaders = new Headers(request.headers);
	requestHeaders.set("x-pathname", request.nextUrl.pathname);

	return NextResponse.next({
		request: {
			headers: requestHeaders,
		},
	});
}

export const config = {
	matcher: [
		/*
		 * Exclude Next internals and static assets; run on all storefront routes.
		 */
		"/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
	],
};
