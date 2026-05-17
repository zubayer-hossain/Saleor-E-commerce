import { NextResponse } from "next/server";

import { saleorAppFetch } from "@/lib/saleor-payments-app";

/**
 * One-shot setup endpoint.
 *
 * Registers the sync webhooks Saleor Dashboard needs to:
 *   - Refund Stripe transactions (TRANSACTION_REFUND_REQUESTED)
 *   - Generate invoices (INVOICE_REQUESTED)
 *
 * Idempotent: any existing webhook with the same name is deleted and
 * re-created so re-running this after URL/secret changes is safe.
 *
 * Auth: requires the same `SALEOR_APP_TOKEN_PAYMENTS` we use for transaction
 * mutations (HANDLE_PAYMENTS, MANAGE_ORDERS, MANAGE_APPS recommended).
 *
 * Usage (PowerShell):
 *   curl.exe -X POST http://localhost:3000/api/saleor/install
 *
 * Run it once after starting the storefront. Re-run if you change
 * NEXT_PUBLIC_STOREFRONT_URL, SALEOR_WEBHOOK_TARGET_ORIGIN, or SALEOR_WEBHOOK_SECRET.
 */

const WEBHOOK_DEFINITIONS = [
	{
		name: "stripe-refund-requested",
		targetPath: "/api/saleor/webhooks/transaction-refund-requested",
		// Dashboard refund → TRANSACTION_REFUND_REQUESTED is synchronous.
		syncEvents: ["TRANSACTION_REFUND_REQUESTED"],
		asyncEvents: [] as string[],
		query: `subscription {
			event {
				... on TransactionRefundRequested {
					action { amount currency }
					transaction { id pspReference }
				}
			}
		}`,
	},
	{
		name: "storefront-invoice-requested",
		targetPath: "/api/saleor/webhooks/invoice-requested",
		// Dashboard "Generate invoice" uses INVOICE_REQUESTED — it is **async**
		// (WebhookEventTypeAsyncEnum). Putting it in syncEvents caused Saleor
		// GraphQL HTTP 400: invalid WebhookCreateInput.
		syncEvents: [] as string[],
		asyncEvents: ["INVOICE_REQUESTED"],
		query: `subscription {
			event {
				... on InvoiceRequested {
					invoice { id number }
					order { id number }
				}
			}
		}`,
	},
] as const;

export async function POST() {
	try {
		const storefrontUrl = resolveWebhookTargetOrigin();
		const secret = process.env.SALEOR_WEBHOOK_SECRET;
		if (!secret) {
			return NextResponse.json(
				{ error: "Set SALEOR_WEBHOOK_SECRET in saleor-storefront/.env before installing webhooks." },
				{ status: 400 },
			);
		}

		const app = await getStorefrontApp();
		if (!app) {
			return NextResponse.json(
				{
					error:
						"Could not find an app owning SALEOR_APP_TOKEN_PAYMENTS. Make sure the token belongs to a local Saleor App created in Dashboard → Apps.",
				},
				{ status: 400 },
			);
		}

		const installed: Array<{ name: string; id: string; url: string }> = [];

		for (const def of WEBHOOK_DEFINITIONS) {
			const targetUrl = `${storefrontUrl}${def.targetPath}`;

			// Delete existing webhook with the same name (best-effort).
			const existing = app.webhooks?.find((w) => w.name === def.name);
			if (existing?.id) {
				await saleorAppFetch(
					`mutation DeleteWebhook($id: ID!) { webhookDelete(id: $id) { errors { message } } }`,
					{ id: existing.id },
				).catch(() => null);
			}

			const created = await saleorAppFetch<{
				webhookCreate: {
					webhook: { id: string; name: string; targetUrl: string } | null;
					errors: Array<{ message: string; code?: string; field?: string }>;
				};
			}>(
				`mutation CreateWebhook($input: WebhookCreateInput!) {
					webhookCreate(input: $input) {
						webhook { id name targetUrl }
						errors { message code field }
					}
				}`,
				{
					input: {
						name: def.name,
						targetUrl,
						secretKey: secret,
						isActive: true,
						// Omit `app`: when authenticated with the app's token, Saleor
						// attaches the webhook to that app automatically.
						...(def.syncEvents.length > 0 ? { syncEvents: def.syncEvents } : {}),
						...(def.asyncEvents.length > 0 ? { asyncEvents: def.asyncEvents } : {}),
						query: def.query,
					},
				},
			);

			const errors = created.data?.webhookCreate?.errors ?? [];
			if (errors.length > 0) {
				return NextResponse.json(
					{
						error: `webhookCreate failed for ${def.name}: ${errors.map((e) => e.message).join("; ")}`,
						hint:
							"App may be missing required permissions. Edit the app in Dashboard → Apps and grant HANDLE_PAYMENTS, MANAGE_ORDERS, and MANAGE_APPS.",
					},
					{ status: 500 },
				);
			}

			const webhook = created.data?.webhookCreate?.webhook;
			if (webhook) installed.push({ name: webhook.name, id: webhook.id, url: webhook.targetUrl });
		}

		return NextResponse.json({
			ok: true,
			appId: app.id,
			appName: app.name,
			installed,
			webhookTargetOrigin: storefrontUrl,
			warnings: webhookInstallWarnings(storefrontUrl),
			note: "Saleor Dashboard will now route Refund and Invoice actions to your storefront.",
		});
	} catch (err) {
		console.error("[saleor/install] unexpected error:", err);
		const message = err instanceof Error ? err.message : "Unexpected error";
		return NextResponse.json({ error: message }, { status: 500 });
	}
}

interface AppNode {
	id: string;
	name: string;
	webhooks: Array<{ id: string; name: string }>;
}

/**
 * Locate the app that owns `SALEOR_APP_TOKEN_PAYMENTS`. The `me` shortcut
 * returns the app behind the bearer token on the request, which is exactly
 * what we want.
 */
async function getStorefrontApp(): Promise<AppNode | null> {
	const result = await saleorAppFetch<{
		app: AppNode | null;
	}>(`query StorefrontApp {
		app {
			id
			name
			webhooks { id name }
		}
	}`);

	return result.data?.app ?? null;
}

/**
 * URLs Saleor POSTs webhooks to (must be reachable from the **Saleor api/worker**
 * containers). `localhost` fails inside Docker — worker connects to ::1 inside its
 * own namespace → connection refused (what you see under Extension Webhooks).
 */
function resolveWebhookTargetOrigin(): string {
	const trimmed = (value: string | undefined) => value?.trim().replace(/\/$/, "") ?? "";

	const dockerSibling = inferDockerStorefrontOrigin();
	const configured = trimmed(process.env.SALEOR_WEBHOOK_TARGET_ORIGIN);

	// Non-loopback explicit URL (e.g. production ingress) always wins.
	if (configured && !isLoopbackWebhookOrigin(configured)) {
		return configured;
	}

	// Compose / Docker Saleor: never register localhost webhooks — worker resolves ::1 inside its container.
	if (dockerSibling) {
		return dockerSibling;
	}

	if (configured) {
		return configured;
	}

	return trimmed(process.env.NEXT_PUBLIC_STOREFRONT_URL) || "http://localhost:3000";
}

function isLoopbackWebhookOrigin(origin: string): boolean {
	try {
		const host = new URL(origin).hostname.toLowerCase();
		return host === "localhost" || host === "127.0.0.1" || host === "::1";
	} catch {
		return false;
	}
}

function inferDockerStorefrontOrigin(): string | null {
	try {
		const server = process.env.SALEOR_API_SERVER_URL;
		if (!server) return null;
		const u = new URL(server.trim());
		if (u.hostname === "api") {
			return "http://storefront:3000";
		}
	} catch {
		return null;
	}
	return null;
}

function webhookInstallWarnings(origin: string): string[] {
	const warnings: string[] = [];
	try {
		const host = new URL(origin).hostname.toLowerCase();
		if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
			warnings.push(
				"Webhook target uses loopback — Saleor Docker worker cannot reach it (Dashboard shows FAILED to ::1:3000). Set SALEOR_WEBHOOK_TARGET_ORIGIN=http://storefront:3000 in Compose or run POST /api/saleor/install from the storefront container so SALEOR_API_SERVER_URL=api triggers auto-detection.",
			);
		}
	} catch {
		/* ignore */
	}
	return warnings;
}
