# Stripe (test mode) — direct integration

This storefront talks to **Stripe Payment Intents** directly from Next.js route handlers
and writes the result back into Saleor via the Transactions API. There is **no separate
Saleor App** to deploy — the integration lives entirely in `saleor-storefront`.

## Architecture

```
Browser                            Storefront (Next.js)                 Stripe                  Saleor
─────────                          ────────────────────                 ──────                  ──────
PaymentElement.confirm   ──▶  POST /api/stripe/create-intent
                                  │  paymentIntents.create  ─────▶  PaymentIntent
                                  │  transactionCreate         ─────────────────────▶ Saleor txn
                                  ◀── { clientSecret, transactionId }
stripe.confirmPayment    ─────────────────────────────────▶  charge card (+ 3DS)
                              POST /api/stripe/finalize
                                  │  paymentIntents.retrieve (verify "succeeded")
                                  │  transactionEventReport CHARGE_SUCCESS ──────────▶ Saleor txn
                                  │  checkoutComplete                       ──────────▶ Saleor order
                                  ◀── { orderId }
                                                                     ▼
                                              POST /api/stripe/webhook  ◀──── Stripe
                                                  payment_intent.succeeded → safety-net event
```

The webhook is a **safety net**: if the customer's browser dies between
`stripe.confirmPayment` and `/api/stripe/finalize`, Stripe still reports
`payment_intent.succeeded` and we mirror it into Saleor's transaction. The
event report is idempotent (Saleor de-dupes by `pspReference + type`).

## Files

| File                                                     | Role                                                    |
| -------------------------------------------------------- | ------------------------------------------------------- |
| `src/lib/stripe.ts`                                      | Server-only Stripe SDK + webhook secret accessor        |
| `src/lib/saleor-payments-app.ts`                         | Server-only Saleor GraphQL client (App token)           |
| `src/lib/saleor-webhook.ts`                              | HMAC-verifies inbound Saleor sync webhooks              |
| `src/app/api/stripe/create-intent/route.ts`              | `POST` — PaymentIntent + Saleor `transactionCreate`     |
| `src/app/api/stripe/finalize/route.ts`                   | `POST` — verify PI + Saleor `transactionEventReport` + `checkoutComplete` |
| `src/app/api/stripe/webhook/route.ts`                    | `POST` — Stripe webhook → Saleor `transactionEventReport` |
| `src/app/api/saleor/webhooks/transaction-refund-requested/route.ts` | Sync webhook: Dashboard "Transfer funds" → Stripe refund |
| `src/app/api/saleor/webhooks/invoice-requested/route.ts` | Sync webhook: Dashboard "Generate invoice" → storefront URL |
| `src/app/api/saleor/install/route.ts`                    | One-shot install: registers both Saleor sync webhooks  |
| `src/app/invoices/[orderId]/page.tsx`                    | Public printable HTML invoice rendered for staff & customers |
| `src/checkout/components/payment/stripe-payment-form.tsx`| Client: `Elements` + `PaymentElement` + 3DS return handler |
| `src/checkout/views/saleor-checkout/payment-step.tsx`    | Stripe-only payment step (no PayPal/iDEAL placeholders) |

## One-time setup

### 1. Stripe keys

In <https://dashboard.stripe.com/test/apikeys> copy:

- **Publishable key** (`pk_test_…`)
- **Secret key** (`sk_test_…`)

Paste them in `saleor-storefront/.env`:

```
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…
STRIPE_SECRET_KEY=sk_test_…
```

### 2. Saleor App token (`HANDLE_PAYMENTS`)

The storefront's route handlers call `transactionCreate`, `transactionEventReport`
and `checkoutComplete` server-side. These need an App token, not a customer JWT.

1. Open <http://localhost:9000/apps/> (Saleor Dashboard → Apps).
2. Click **Create app** → name it `Storefront Stripe Bridge`.
3. Permissions: enable **`HANDLE_PAYMENTS`**, **`MANAGE_CHECKOUTS`**, **`MANAGE_ORDERS`**, and **`MANAGE_APPS`**. **`MANAGE_ORDERS`** is required for Dashboard **Generate invoice** (Saleor only delivers `INVOICE_REQUESTED` to apps that have it, and `invoiceUpdate` needs it too). **`MANAGE_APPS`** is needed so `/api/saleor/install` can register webhooks on the app.
4. Save → in the new app, **Tokens** → **Create token** → copy the value.
5. Paste it in `.env`:

```
SALEOR_APP_TOKEN_PAYMENTS=<token from Dashboard>
```

### 3. Stripe webhook (Stripe CLI)

Install the Stripe CLI (Windows / Scoop):

```powershell
scoop bucket add stripe https://github.com/stripe/scoop-stripe-cli.git
scoop install stripe
```

Log in and forward webhooks to the storefront:

```powershell
stripe login
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copy the printed `whsec_…` value into `.env`:

```
STRIPE_WEBHOOK_SECRET=whsec_…
```

Keep `stripe listen` running in a separate terminal while you test.

### 4. Apply env to the container

```powershell
cd D:\laragon\www\ecom-opensource\saleor-platform
docker compose restart storefront
```

The storefront reads `saleor-storefront/.env` via the `env_file:` directive.

### 5. (Refunds + Invoices) Register Saleor webhooks

To make Saleor Dashboard's **"Transfer funds"** (refund) and **"Generate"**
(invoice) buttons work, the storefront exposes HTTP endpoints Saleor POSTs to.

#### URLs Saleor will call

Saleor Core and the Celery **worker** run in Docker and dispatch webhooks from
those containers. They **cannot** reach `http://localhost:3000` reliably —
inside a container `localhost` is the container itself.

When using `saleor-platform/docker-compose.yml`, the storefront service sets:

```
SALEOR_WEBHOOK_TARGET_ORIGIN=http://storefront:3000
```

Do **not** set `SALEOR_WEBHOOK_TARGET_ORIGIN=http://localhost:3000` in `.env` while Saleor runs in Docker.
If you do, Extension Webhooks show deliveries **FAILED** to **`::1:3000`** (IPv6 localhost inside the worker
container — nothing is listening there). Prefer leaving `SALEOR_WEBHOOK_TARGET_ORIGIN` unset: `/api/saleor/install`
detects `SALEOR_API_SERVER_URL=http://api:8000/…` and registers **`http://storefront:3000`** automatically.

The installer registers webhook `targetUrl` values against **that** origin
(so Saleor posts to `http://storefront:3000/api/saleor/webhooks/…`). Invoice
links stored on the invoice record still use **`NEXT_PUBLIC_STOREFRONT_URL`**
(`http://localhost:3000`) so staff and shoppers open them in the browser.

If you run the Next.js dev server **only on the host** (no storefront service),
set `SALEOR_WEBHOOK_TARGET_ORIGIN` to whatever Saleor containers can route to,
typically `http://host.docker.internal:3000` on Docker Desktop.

#### Secret + installer

Both webhook handlers share one secret used for HMAC verification.

Add to `saleor-storefront/.env`:

```
# 32+ random bytes. Used to HMAC-verify inbound Saleor webhooks.
SALEOR_WEBHOOK_SECRET=<run: openssl rand -hex 32>
```

If you generate it from PowerShell while your cwd is `saleor-platform`, append to the sibling storefront `.env` (not `saleor-platform/saleor-storefront/`):

```powershell
"SALEOR_WEBHOOK_SECRET=$([guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N'))" `
  | Add-Content ..\saleor-storefront\.env
```

Re-apply env to the container:

```powershell
docker compose restart storefront
```

Then trigger the one-shot installer (uses `SALEOR_APP_TOKEN_PAYMENTS`):

```powershell
curl.exe -X POST http://localhost:3000/api/saleor/install
```

You should see something like:

```json
{
  "ok": true,
  "appId": "QXBwOjE=",
  "appName": "Storefront Stripe Bridge",
  "installed": [
    { "name": "stripe-refund-requested", "url": "http://storefront:3000/api/saleor/webhooks/transaction-refund-requested" },
    { "name": "storefront-invoice-requested", "url": "http://storefront:3000/api/saleor/webhooks/invoice-requested" }
  ]
}
```

If `appId` is `null`, your `SALEOR_APP_TOKEN_PAYMENTS` doesn't belong to a
local Saleor App. Re-create the token under **Dashboard → Apps → your app →
Tokens**. The app must also have `MANAGE_APPS` so it can register webhooks
on itself.

Re-run this endpoint any time you change `NEXT_PUBLIC_STOREFRONT_URL`,
`SALEOR_WEBHOOK_TARGET_ORIGIN`, or `SALEOR_WEBHOOK_SECRET` — it deletes and
re-creates the webhooks by name.

Saleor sends the HTTP header **`saleor-api-url`** (often `http://api:8000/graphql/`
from Docker). The storefront trusts both `NEXT_PUBLIC_SALEOR_API_URL` and
`SALEOR_API_SERVER_URL` at verification time — ensure compose sets
`SALEOR_API_SERVER_URL=http://api:8000/graphql/` for the storefront container.

## Test a payment

1. Open <http://localhost:3000/shop>, add a product to the bag, go to checkout.
2. Complete Information → Shipping → Payment.
3. In the Stripe Payment Element use card `4242 4242 4242 4242`, any future
   expiry, any CVC, any postal code.
4. Click **Pay**. The form will:
   - `POST /api/stripe/create-intent` → Stripe + Saleor transaction
   - `stripe.confirmPayment` → charge card (3DS if required)
   - `POST /api/stripe/finalize` → Saleor order
   - Redirect to the order-confirmation view (`?orderId=…`)

In the Stripe CLI terminal you'll see the webhook event arrive, e.g.
`payment_intent.succeeded` → 200 from `/api/stripe/webhook`.

### Failure cards

| Scenario                            | Card number          |
| ----------------------------------- | -------------------- |
| Always declined                     | `4000 0000 0000 0002` |
| Insufficient funds                  | `4000 0000 0000 9995` |
| Requires authentication (3DS)       | `4000 0027 6000 3184` |

Full list: <https://docs.stripe.com/testing#cards>

## Refund a paid order

1. Open the order in <http://localhost:9000/orders/> Saleor Dashboard.
2. Click **+ New refund**.
3. Pick the transaction (e.g. **Stripe Card — Capture**) and a refund amount.
4. Add a reason and click **Transfer funds**.

What happens under the hood:

- Saleor fires **`TRANSACTION_REFUND_REQUESTED`** at
  `/api/saleor/webhooks/transaction-refund-requested`.
- We HMAC-verify the request, look up the linked Stripe `PaymentIntent` by
  `pspReference`, and call `stripe.refunds.create({ payment_intent, amount })`.
- We respond with `{ pspReference: re_…, result: "REFUND_SUCCESS", amount }`
  — Saleor records a `REFUND_SUCCESS` event against the transaction and the
  order's outstanding balance updates.
- The Stripe webhook (`charge.refunded`) is still a safety net: it reports
  the refund a second time which Saleor de-dupes via `pspReference`.

If the dashboard still says **"No app or plugin is configured to handle
requested transaction action"**, the installer didn't run successfully. Re-run
`POST /api/saleor/install` and check the JSON response.

## Invoices

1. Open the order in Dashboard.
2. In the **Invoices** card on the right, click **Generate**.
3. Refresh — a new invoice appears with a link.

**If Generate spins and nothing shows:** the Celery worker POSTs `INVOICE_REQUESTED` to your storefront; if that fails or `invoiceUpdate` never runs, the invoice stays **PENDING** and the Dashboard hides it. Fix checklist:

- App permissions must include **`MANAGE_ORDERS`** on the same app as `SALEOR_APP_TOKEN_PAYMENTS`. After editing permissions in Dashboard, **create a new token**, update `.env`, `docker compose restart storefront`, then `curl -X POST http://localhost:3000/api/saleor/install`.
- Webhook URLs must use the Docker-internal origin (`http://storefront:3000/…`) — see §5 (`SALEOR_WEBHOOK_TARGET_ORIGIN` in compose).
- Dashboard shows **FAILED — Invalid IP address**: `common.env` turns on Saleor's SSRF-style outbound IP filter (`HTTP_IP_FILTER_ENABLED=True`). Async webhooks run in **Celery** — the **`worker`** service needs the same override as **`api`**: `HTTP_IP_FILTER_ENABLED=False` (already set in `saleor-platform/docker-compose.yml`). Run `docker compose restart worker` after pulling changes.
- Inspect failures: `docker compose logs worker --tail=80` right after clicking Generate (look for webhook HTTP 401/500).

Behind the scenes:

- Saleor emits **`INVOICE_REQUESTED`** as an **async** webhook (not sync); the installer registers it under `asyncEvents`, not `syncEvents`. Putting it in `syncEvents` causes GraphQL `webhookCreate` to fail with HTTP 400.
- Saleor POSTs to `/api/saleor/webhooks/invoice-requested`.
- We HMAC-verify, compute a permalink (`/invoices/<orderId>`) on the
  storefront, and call `invoiceUpdate` to attach that URL + a number to the
  invoice record.
- Dashboard and the customer's **My orders → Order detail** page both list
  the invoice and link to the same printable HTML page (browser → File →
  Print → Save as PDF).

The printable page is at `src/app/invoices/[orderId]/page.tsx`. The HTML is
print-friendly out of the box (`@media print`). Saleor's reference PDF pipeline
(upload + `invoiceCreate`-style flow) lives in
[`saleor/examples/example-app-invoices`](https://github.com/saleor/examples/tree/main/example-app-invoices)
— swap our HTML route for that approach if you need PDF blobs stored in Saleor media.

## Production checklist (when you're ready)

- Replace `pk_test_…` / `sk_test_…` with live keys.
- Replace `stripe listen` with a real webhook endpoint configured in
  <https://dashboard.stripe.com/webhooks> (events:
  `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`).
- Issue a **restricted API key (`rk_…`)** for `STRIPE_SECRET_KEY` instead of the
  account-wide secret key — limit scope to PaymentIntents + Charges.
- Rotate the Saleor App token on a schedule.
- Move Stripe Dashboard → Settings → Payment methods to **card-only** if you
  literally want to reject all other methods. (`payment_method_types` is
  intentionally not pinned in code, per Stripe best practice.)
- For the Saleor sync webhooks, prefer **JWS signature verification** over the
  HMAC `secretKey`. The official Saleor App framework verifies JWS via the
  app's JWKS; you can swap `lib/saleor-webhook.ts` to do the same with a JOSE
  library (`jose.jwtVerify` against `https://<api>/.well-known/jwks.json`).
- For PDF invoices, replace the printable HTML route with a real PDF renderer
  (e.g. Puppeteer + Chromium running in a separate Docker service) and store
  the file in object storage; pass that URL to `invoiceUpdate`.
