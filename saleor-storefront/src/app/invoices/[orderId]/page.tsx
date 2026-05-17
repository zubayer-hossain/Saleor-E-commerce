import { notFound } from "next/navigation";

import { saleorAppFetch } from "@/lib/saleor-payments-app";
import { brandConfig } from "@/config/brand";

interface PageProps {
	params: Promise<{ orderId: string }>;
}

interface InvoiceOrder {
	id: string;
	number: string;
	created: string;
	userEmail: string | null;
	total: Money;
	subtotal: Money;
	shippingPrice: Money;
	billingAddress: Address | null;
	shippingAddress: Address | null;
	lines: Array<{
		id: string;
		productName: string;
		variantName: string | null;
		quantity: number;
		unitPrice: Money;
		totalPrice: Money;
	}>;
}

interface Money {
	gross: { amount: number; currency: string };
	tax?: { amount: number; currency: string };
}

interface Address {
	firstName: string | null;
	lastName: string | null;
	companyName: string | null;
	streetAddress1: string | null;
	streetAddress2: string | null;
	city: string | null;
	postalCode: string | null;
	countryArea: string | null;
	country: { country: string };
}

export default async function InvoicePage({ params }: PageProps) {
	const { orderId } = await params;

	const result = await saleorAppFetch<{ order: InvoiceOrder | null }>(
		`query StorefrontInvoiceOrder($id: ID!) {
			order(id: $id) {
				id
				number
				created
				userEmail
				total {
					gross { amount currency }
					tax { amount currency }
				}
				subtotal { gross { amount currency } }
				shippingPrice { gross { amount currency } }
				billingAddress {
					firstName lastName companyName streetAddress1 streetAddress2
					city postalCode countryArea country { country }
				}
				shippingAddress {
					firstName lastName companyName streetAddress1 streetAddress2
					city postalCode countryArea country { country }
				}
				lines {
					id productName variantName quantity
					unitPrice { gross { amount currency } }
					totalPrice { gross { amount currency } }
				}
			}
		}`,
		{ id: orderId },
	);

	const order = result.data?.order;
	if (!order) {
		notFound();
	}

	const tax = order.total.tax?.amount ?? 0;
	const fmt = (m: { amount: number; currency: string }) =>
		new Intl.NumberFormat("en-US", { style: "currency", currency: m.currency }).format(m.amount);

	return (
		<>
			<style>{printStyles}</style>
			<main className="invoice-root">
				<header className="invoice-head">
					<div>
						<h1>{brandConfig.siteName}</h1>
						<p className="muted">{brandConfig.tagline ?? "Invoice"}</p>
					</div>
					<div className="right">
						<h2>Invoice INV-{order.number}</h2>
						<p className="muted">Date: {new Date(order.created).toLocaleDateString()}</p>
						<p className="muted">Order #{order.number}</p>
					</div>
				</header>

				<section className="grid two">
					{order.billingAddress && (
						<AddressBlock title="Billed to" address={order.billingAddress} email={order.userEmail} />
					)}
					{order.shippingAddress && <AddressBlock title="Ship to" address={order.shippingAddress} />}
				</section>

				<table className="lines">
					<thead>
						<tr>
							<th align="left">Item</th>
							<th align="right">Qty</th>
							<th align="right">Unit</th>
							<th align="right">Total</th>
						</tr>
					</thead>
					<tbody>
						{order.lines.map((line) => (
							<tr key={line.id}>
								<td>
									{line.productName}
									{line.variantName ? ` — ${line.variantName}` : ""}
								</td>
								<td align="right">{line.quantity}</td>
								<td align="right">{fmt(line.unitPrice.gross)}</td>
								<td align="right">{fmt(line.totalPrice.gross)}</td>
							</tr>
						))}
					</tbody>
				</table>

				<section className="totals">
					<dl>
						<dt>Subtotal</dt>
						<dd>{fmt(order.subtotal.gross)}</dd>
						<dt>Shipping</dt>
						<dd>
							{order.shippingPrice.gross.amount === 0 ? "Free" : fmt(order.shippingPrice.gross)}
						</dd>
						{tax > 0 && order.total.tax && (
							<>
								<dt>Tax</dt>
								<dd>{fmt(order.total.tax)}</dd>
							</>
						)}
						<dt className="grand">Total</dt>
						<dd className="grand">{fmt(order.total.gross)}</dd>
					</dl>
				</section>

				<footer className="invoice-foot">
					<p>Thank you for shopping with {brandConfig.siteName}.</p>
					<p className="muted">This invoice was generated automatically. No signature required.</p>
				</footer>
			</main>
		</>
	);
}

function AddressBlock({
	title,
	address,
	email,
}: {
	title: string;
	address: Address;
	email?: string | null;
}) {
	return (
		<div>
			<h3>{title}</h3>
			<p>
				{[address.firstName, address.lastName].filter(Boolean).join(" ")}
				{address.companyName ? <><br />{address.companyName}</> : null}
				<br />
				{address.streetAddress1}
				{address.streetAddress2 ? <><br />{address.streetAddress2}</> : null}
				<br />
				{[address.city, address.postalCode].filter(Boolean).join(", ")}
				{address.countryArea ? `, ${address.countryArea}` : ""}
				<br />
				{address.country.country}
				{email ? (
					<>
						<br />
						{email}
					</>
				) : null}
			</p>
		</div>
	);
}

const printStyles = `
	body { background: #f5f5f5; }
	.invoice-root {
		max-width: 820px;
		margin: 32px auto;
		background: #fff;
		padding: 48px;
		border: 1px solid #e5e5e5;
		font-family: system-ui, sans-serif;
		color: #111;
		font-size: 14px;
		line-height: 1.5;
	}
	.invoice-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 24px;
		margin-bottom: 32px;
	}
	.invoice-head h1 { margin: 0; font-size: 22px; }
	.invoice-head h2 { margin: 0; font-size: 18px; }
	.invoice-head .right { text-align: right; }
	.muted { color: #6b6b6b; margin: 4px 0; }
	.grid.two { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 32px; }
	.grid.two h3 { margin: 0 0 6px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b6b6b; }
	.grid.two p { margin: 0; }
	table.lines { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
	table.lines th, table.lines td { padding: 10px 8px; border-bottom: 1px solid #ececec; }
	table.lines th { font-size: 12px; text-transform: uppercase; color: #6b6b6b; }
	.totals { display: flex; justify-content: flex-end; margin-bottom: 24px; }
	.totals dl { display: grid; grid-template-columns: auto auto; gap: 6px 32px; min-width: 260px; margin: 0; }
	.totals dt { color: #6b6b6b; }
	.totals dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
	.totals .grand { font-size: 16px; font-weight: 600; border-top: 1px solid #d6d6d6; padding-top: 8px; margin-top: 4px; }
	.invoice-foot { border-top: 1px solid #ececec; padding-top: 16px; text-align: center; }
	@media print {
		body { background: #fff; }
		.invoice-root { margin: 0; border: none; padding: 16px; }
	}
`;
