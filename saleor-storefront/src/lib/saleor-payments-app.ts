import "server-only";

import { getSaleorGraphQLUrlServer } from "@/lib/saleor-api-url";

/**
 * Server-only Saleor GraphQL client authenticated with a long-lived **App token**
 * (`SALEOR_APP_TOKEN_PAYMENTS`) carrying `HANDLE_PAYMENTS` + `MANAGE_CHECKOUTS`
 * permissions.
 *
 * Why a separate client?
 * - `transactionCreate` and `transactionEventReport` require an App token; the
 *   public checkout executor uses no auth, and the user-auth client uses the
 *   customer's JWT (which lacks payment perms).
 * - Keeping the token server-only avoids leaking it into any client bundle.
 *
 * Token must be created in Saleor Dashboard → Apps → Create local app:
 *   permissions: HANDLE_PAYMENTS, MANAGE_CHECKOUTS, MANAGE_ORDERS, MANAGE_APPS
 *
 * `MANAGE_ORDERS` is required for `invoiceUpdate` and for Saleor to deliver the
 * `INVOICE_REQUESTED` webhook to your app (Saleor filters webhooks by permission).
 */

export interface SaleorAppGraphQLResult<T = unknown> {
	data?: T;
	errors?: Array<{ message: string; path?: ReadonlyArray<string | number> }>;
}

export async function saleorAppFetch<T = unknown>(
	query: string,
	variables?: Record<string, unknown>,
): Promise<SaleorAppGraphQLResult<T>> {
	const token = process.env.SALEOR_APP_TOKEN_PAYMENTS;
	if (!token) {
		throw new Error(
			"Missing SALEOR_APP_TOKEN_PAYMENTS. Create a Saleor App in Dashboard → Apps with HANDLE_PAYMENTS, MANAGE_CHECKOUTS, MANAGE_ORDERS, and MANAGE_APPS — copy its token to saleor-storefront/.env.",
		);
	}

	const url = getSaleorGraphQLUrlServer();
	const res = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
		},
		body: JSON.stringify({ query, variables }),
		cache: "no-store",
	});

	if (!res.ok) {
		const text = await res.text().catch(() => "");
		let graphqlErrors = "";
		try {
			const parsed = JSON.parse(text) as { errors?: Array<{ message: string }> };
			if (parsed.errors?.length) {
				graphqlErrors = parsed.errors.map((e) => e.message).join("; ");
			}
		} catch {
			/* not JSON */
		}
		throw new Error(
			`Saleor App GraphQL HTTP ${res.status}: ${graphqlErrors || `${res.statusText}\n${text.slice(0, 500)}`}`,
		);
	}

	const json = (await res.json()) as SaleorAppGraphQLResult<T>;
	if (json.errors?.length) {
		throw new Error(`Saleor GraphQL: ${json.errors.map((e) => e.message).join("; ")}`);
	}
	return json;
}
