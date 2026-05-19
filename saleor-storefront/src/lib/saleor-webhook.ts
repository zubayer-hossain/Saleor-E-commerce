import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Shared helpers for Saleor sync/async webhooks that this storefront serves.
 *
 * Auth model: each webhook is registered with `secretKey` = `SALEOR_WEBHOOK_SECRET`,
 * which Saleor uses to HMAC-SHA256 the raw request body. We re-compute and compare.
 *
 * Production note: Saleor 3.7+ also supports app JWS signing (header
 * `Saleor-Signature` carrying a JWS over the body, verified against the app's
 * RSA public key via JWKS). For this local demo we stick with HMAC.
 */

const SECRET_HEADERS = ["saleor-signature", "x-saleor-signature"] as const;

export interface SaleorWebhookContext {
	rawBody: string;
	apiUrl: string | null;
	event: string | null;
	domain: string | null;
}

export class SaleorWebhookError extends Error {
	constructor(public readonly status: number, message: string) {
		super(message);
		this.name = "SaleorWebhookError";
	}
}

/**
 * Read raw body and verify Saleor's signature. Throws `SaleorWebhookError`
 * on failure so callers can convert to a NextResponse.
 */
export async function verifyAndParseSaleorRequest(request: Request): Promise<SaleorWebhookContext> {
	const rawBody = await request.text();

	const apiUrl = request.headers.get("saleor-api-url");
	if (apiUrl && !isTrustedSaleorApiUrl(apiUrl)) {
		throw new SaleorWebhookError(
			401,
			`Unexpected saleor-api-url header: ${apiUrl}. Set SALEOR_API_SERVER_URL to match Saleor's internal GraphQL URL (e.g. http://api:8000/graphql/) when running webhooks from Docker.`,
		);
	}

	const secret = process.env.SALEOR_WEBHOOK_SECRET;
	if (secret) {
		let providedSignature: string | null = null;
		for (const name of SECRET_HEADERS) {
			const v = request.headers.get(name);
			if (v) {
				providedSignature = v;
				break;
			}
		}
		if (!providedSignature) {
			throw new SaleorWebhookError(401, "Missing Saleor signature header");
		}
		// Strip leading scheme like "sha256=" if Saleor adds one.
		const normalized = providedSignature.replace(/^sha256=/, "").trim();
		if (!verifyHmac(rawBody, normalized, secret)) {
			throw new SaleorWebhookError(401, "Invalid Saleor webhook signature");
		}
	} else if (process.env.NODE_ENV === "production") {
		throw new SaleorWebhookError(
			500,
			"SALEOR_WEBHOOK_SECRET is required in production for webhook signature verification.",
		);
	}

	return {
		rawBody,
		apiUrl,
		event: request.headers.get("saleor-event"),
		domain: request.headers.get("saleor-domain"),
	};
}

function timingSafeEqualUtf8Strings(a: string, b: string): boolean {
	try {
		const ba = Buffer.from(a, "utf-8");
		const bb = Buffer.from(b, "utf-8");
		if (ba.length !== bb.length) return false;
		return timingSafeEqual(new Uint8Array(ba), new Uint8Array(bb));
	} catch {
		return false;
	}
}

/** Saleor legacy `secretKey` webhooks sign with HMAC-SHA256; encoding varies by version. */
function verifyHmac(payload: string, signature: string, secret: string): boolean {
	try {
		const normalized = signature.replace(/^sha256=/i, "").trim();
		const hmac = createHmac("sha256", secret).update(payload);

		const hex = hmac.digest("hex");
		if (timingSafeEqualUtf8Strings(normalized, hex)) return true;

		const hmac2 = createHmac("sha256", secret).update(payload);
		const b64 = hmac2.digest("base64");
		if (timingSafeEqualUtf8Strings(normalized, b64)) return true;

		const hmac3 = createHmac("sha256", secret).update(payload);
		const b64url = hmac3.digest("base64url");
		if (timingSafeEqualUtf8Strings(normalized, b64url)) return true;

		return false;
	} catch {
		return false;
	}
}

/**
 * Normalize Saleor GraphQL endpoint for comparison (scheme + host + path, trim slashes).
 */
function normalizeGraphQlEndpoint(raw: string): string {
	try {
		const u = new URL(raw.trim());
		const path = u.pathname.replace(/\/+$/, "") || "";
		return `${u.protocol}//${u.host}${path}`;
	} catch {
		return raw.trim();
	}
}

/**
 * Saleor attaches `saleor-api-url` when POSTing webhooks. In Docker that is often
 * `http://api:8000/graphql/`, while `NEXT_PUBLIC_SALEOR_API_URL` may be `http://127.0.0.1:8000/graphql/`.
 * Treat both as the same Saleor instance when `SALEOR_API_SERVER_URL` is set correctly.
 */
function isTrustedSaleorApiUrl(headerValue: string): boolean {
	const candidates = [
		process.env.NEXT_PUBLIC_SALEOR_API_URL,
		process.env.SALEOR_API_SERVER_URL,
	].filter(Boolean) as string[];

	if (candidates.length === 0) return true;

	const incoming = normalizeGraphQlEndpoint(headerValue);
	for (const c of candidates) {
		if (incoming === normalizeGraphQlEndpoint(c)) return true;
	}

	// Dev: localhost vs 127.0.0.1 — same Saleor port/path from host vs Saleor header
	try {
		const i = new URL(headerValue.trim());
		const localhostLike = new Set(["localhost", "127.0.0.1", "::1"]);
		for (const c of candidates) {
			try {
				const j = new URL(c.trim());
				const pathMatch =
					i.pathname.replace(/\/+$/, "") === j.pathname.replace(/\/+$/, "");
				if (
					localhostLike.has(i.hostname) &&
					localhostLike.has(j.hostname) &&
					i.protocol === j.protocol &&
					i.port === j.port &&
					pathMatch
				) {
					return true;
				}
			} catch {
				continue;
			}
		}
		// Compose: SALEOR_API_SERVER_URL is often http://api:8000/graphql/ but Saleor may send
		// saleor-api-url as http://localhost:8000/graphql/ (PUBLIC_URL / internal resolution).
		const stripTrailingSlash = (path: string) => path.replace(/\/+$/, "");
		for (const c of candidates) {
			try {
				const cand = new URL(c.trim());
				const pathMatch = stripTrailingSlash(i.pathname) === stripTrailingSlash(cand.pathname);
				if (!pathMatch || i.protocol !== cand.protocol) continue;
				const p1 = i.port || (i.protocol === "https:" ? "443" : "80");
				const p2 = cand.port || (cand.protocol === "https:" ? "443" : "80");
				if (p1 !== p2) continue;
				if (!hostnameIsSaleorComposeAlias(i.hostname) || !hostnameIsSaleorComposeAlias(cand.hostname))
					continue;
				return true;
			} catch {
				continue;
			}
		}
	} catch {
		return false;
	}

	return false;
}

/** Hostnames that all refer to the same Saleor Core in local Docker Compose. */
function hostnameIsSaleorComposeAlias(hostname: string): boolean {
	const h = hostname.toLowerCase();
	return (
		h === "api" ||
		h === "localhost" ||
		h === "127.0.0.1" ||
		h === "::1" ||
		h === "host.docker.internal"
	);
}

/**
 * Parse a sync-webhook JSON body produced by a subscription query. Saleor wraps
 * subscription payloads as a single object whose shape depends on the event.
 *
 * We type the return as `unknown` so each route can validate the shape that
 * matches its subscription query.
 */
export function parseSubscriptionPayload(rawBody: string): unknown {
	if (!rawBody) return null;
	try {
		return JSON.parse(rawBody);
	} catch {
		return null;
	}
}

/**
 * Subscription webhook bodies usually nest the fragment under `event`.
 */
export function unwrapWebhookSubscriptionPayload(parsed: unknown): unknown {
	if (!parsed || typeof parsed !== "object") return parsed;
	const obj = parsed as Record<string, unknown>;
	if ("event" in obj && obj.event !== null && typeof obj.event === "object") {
		return obj.event;
	}
	return parsed;
}
