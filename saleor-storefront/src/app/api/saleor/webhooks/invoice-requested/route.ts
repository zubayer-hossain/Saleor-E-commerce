import { NextResponse } from "next/server";

import { saleorAppFetch } from "@/lib/saleor-payments-app";
import {
	SaleorWebhookError,
	parseSubscriptionPayload,
	unwrapWebhookSubscriptionPayload,
	verifyAndParseSaleorRequest,
} from "@/lib/saleor-webhook";

/**
 * Async webhook: INVOICE_REQUESTED
 * ---------------------------------
 * Fired when a Saleor staff member clicks "Generate" under Invoices on an
 * order. Without an app handling this, Dashboard shows "No app or plugin is
 * configured to handle invoice requests."
 *
 * Strategy: we don't build a PDF here. We point Saleor at a public storefront
 * route that renders a printable HTML invoice for the order. That URL is what
 * shows up in Dashboard's "Invoices" list and is what we link to in the
 * storefront's order detail view.
 *
 * Saleor delivers this asynchronously via Celery; it POSTs from Docker using
 * `SALEOR_WEBHOOK_TARGET_ORIGIN` (see `/api/saleor/install`).
 *
 * After handling we call `invoiceUpdate`, which sets the invoice job status to
 * SUCCESS — otherwise Dashboard keeps showing "No invoices" because it hides
 * stuck PENDING jobs.
 *
 * Permissions (critical): Saleor only delivers `INVOICE_REQUESTED` to apps whose
 * token includes **MANAGE_ORDERS**. The same permission is required for
 * `invoiceUpdate`.
 */
export async function POST(request: Request) {
	try {
		const ctx = await verifyAndParseSaleorRequest(request);
		const parsed = parseSubscriptionPayload(ctx.rawBody);

		const extracted = extractInvoiceRequestedFields(parsed);
		if (!extracted) {
			console.error("[saleor/invoice] Unexpected payload shape:", parsed);
			return NextResponse.json(
				{ error: "Could not parse InvoiceRequested payload (missing invoice/order ids)." },
				{ status: 400 },
			);
		}

		const { invoiceId, orderId, invoiceNumber, orderNumber } = extracted;

		const storefrontUrl =
			process.env.NEXT_PUBLIC_STOREFRONT_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
		const number = invoiceNumber ?? (orderNumber ? `INV-${orderNumber}` : `INV-${Date.now()}`);
		const url = `${storefrontUrl}/invoices/${encodeURIComponent(orderId)}`;

		const result = await saleorAppFetch<{
			invoiceUpdate: {
				invoice: { id: string; url: string | null; number: string | null } | null;
				errors: Array<{ message: string; code?: string; field?: string }>;
			};
		}>(
			`mutation StorefrontInvoiceUpdate($id: ID!, $input: UpdateInvoiceInput!) {
				invoiceUpdate(id: $id, input: $input) {
					invoice { id url number }
					errors { message code field }
				}
			}`,
			{
				id: invoiceId,
				input: { number, url },
			},
		);

		const mutationErrors = result.data?.invoiceUpdate?.errors ?? [];
		if (mutationErrors.length > 0) {
			console.error("[saleor/invoice] invoiceUpdate mutation errors:", mutationErrors);
			const msg = mutationErrors.map((e) => e.message).join("; ");
			return NextResponse.json({ error: msg }, { status: 500 });
		}

		return NextResponse.json({ invoice: { number, url } });
	} catch (err) {
		if (err instanceof SaleorWebhookError) {
			return NextResponse.json({ error: err.message }, { status: err.status });
		}
		console.error("[saleor/invoice] unexpected error:", err);
		const message = err instanceof Error ? err.message : "Unexpected error";
		let hint = "";
		if (/permission|manage.?orders|MANAGE_ORDERS/i.test(message)) {
			hint =
				" Grant MANAGE_ORDERS to the Saleor App that owns SALEOR_APP_TOKEN_PAYMENTS (Dashboard → Apps → your app → Permissions), recreate the token if needed, restart storefront and POST /api/saleor/install again.";
		}
		return NextResponse.json({ error: `${message}${hint}` }, { status: 500 });
	}
}

interface InvoiceRequestedExtract {
	invoiceId: string;
	orderId: string;
	invoiceNumber: string | null;
	orderNumber: string | null;
}

/** Works across `{ event { … } }`, typename wrappers, and nested trees Saleor may emit. */
function extractInvoiceRequestedFields(parsed: unknown): InvoiceRequestedExtract | null {
	const roots = new Set<unknown>();
	roots.add(parsed);
	roots.add(unwrapWebhookSubscriptionPayload(parsed));

	for (const root of roots) {
		const hit = scanForInvoiceAndOrder(root, 0);
		if (hit) return hit;
	}
	return null;
}

function scanForInvoiceAndOrder(obj: unknown, depth: number): InvoiceRequestedExtract | null {
	if (depth > 14 || obj === null || obj === undefined) return null;
	if (typeof obj !== "object") return null;

	const record = obj as Record<string, unknown>;

	const invoice = record.invoice;
	const order = record.order;

	let invoiceId: string | undefined;
	let orderId: string | undefined;
	let invoiceNumber: string | null = null;
	let orderNumber: string | null = null;

	if (invoice && typeof invoice === "object") {
		const inv = invoice as Record<string, unknown>;
		if (typeof inv.id === "string") invoiceId = inv.id;
		if (typeof inv.number === "string") invoiceNumber = inv.number;
	}
	if (order && typeof order === "object") {
		const ord = order as Record<string, unknown>;
		if (typeof ord.id === "string") orderId = ord.id;
		if (typeof ord.number === "string") orderNumber = ord.number;
	}

	if (invoiceId && orderId) {
		return { invoiceId, orderId, invoiceNumber, orderNumber };
	}

	for (const value of Object.values(record)) {
		const nested = scanForInvoiceAndOrder(value, depth + 1);
		if (nested) return nested;
	}

	return null;
}
