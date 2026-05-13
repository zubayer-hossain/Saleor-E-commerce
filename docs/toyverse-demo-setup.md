# ToyVerse multilingual toy demo — Saleor setup

This guide pairs with the ToyVerse-branded storefront in `saleor-storefront/` and the optional seed script `saleor-platform/scripts/toyverse_seed.py`.

## What stays untouched

- Cookie-backed Saleor language (`EN_US`, `BN_BD`, `AR_BH`, `AR_AE`), Radix language dropdown, SVG flags
- GraphQL `translation(languageCode: …)` wiring on catalog / PDP / search / checkout
- Channel slug routing (`/[channel]/…`)

## 1. Business configuration (Dashboard)

Do these in **Saleor Dashboard** (recommended path — survives upgrades cleanly):

### Currencies & channels

1. **Channels**
   - Keep your storefront slug aligned with `NEXT_PUBLIC_DEFAULT_CHANNEL` (often `default-channel`).
   - Add **BHD** as default currency on your Bahrain-facing channel (or create separate channels per country).
   - Add **AED** on your UAE-facing channel **or** as an alternate pricing/listing setup depending on how you model GCC commerce.

2. **Countries**

   - Enable **Bahrain** (BH) and **United Arab Emirates** (AE) under Shipping configuration where Saleor expects country activation.

### Shipping (demo)

Create lightweight zones:

| Shipping method name | Zone hint |
|---------------------|-----------|
| Bahrain Delivery | Bahrain addresses |
| UAE Delivery | UAE addresses |

Attach sensible flat-rate demo prices per channel currency.

### Taxes (demo)

- Configure VAT-style GST placeholders per country if needed for realism (e.g. nominal percentages shown only at checkout); Saleor tax plugins vary — mirror whatever stack your compose bundle exposes.

### Multilingual content

Ensure Dashboard languages include **English**, **Bengali (Bangladesh)**, **Arabic (Bahrain)**, and **Arabic (United Arab Emirates)** (`AR_AE`) so storefront translations resolve.

### Navigation menus

The seed script can **rebuild** menus **`navbar`** and **`footer`** (Saleor slugs) if your app token includes **MANAGE_MENUS**. Otherwise create them manually or grant that permission and re-run.

## 2. Catalog seed (script)

Requirements:

- Python **3.10+**
- Saleor GraphQL endpoint reachable from your machine (e.g. `http://localhost:8000/graphql/`)
- API identity with **MANAGE_PRODUCTS**, **MANAGE_TRANSLATIONS**, **MANAGE_MENUS** (for menu rebuild), and related catalog permissions (`SALEOR_APP_TOKEN` from a Dashboard App or extension)

Optional environment variables:

| Variable | Purpose |
|----------|---------|
| `TOYVERSE_PRODUCT_TYPE_SLUG` | If set, **every** product uses this Saleor type (slug). Overrides per-category defaults. |
| `TOYVERSE_FALLBACK_PRODUCT_TYPE_SLUG` | If a per-category mapped slug is missing in Saleor (common on minimal installs), prefer this slug before automatic fallbacks (`shirt`, `shoe`, …). |
| `TOYVERSE_CATEGORY_PRODUCT_TYPES_JSON` | JSON object mapping **ToyVerse category slug** → **Saleor product type slug**, e.g. `{\"board-games\":\"beanie\"}`. Merges over script defaults. |
| `TOYVERSE_IMAGE_BASE` | Demo images — default **`https://dummyimage.com`** (`800×800` PNG per SKU). Saleor validates URLs **without following redirects**, so **`picsum.photos`** (302) fails with `UNSUPPORTED_MEDIA_PROVIDER`. Core must reach the chosen host. |
| `TOYVERSE_SKIP_MENUS` | Set to `1` to skip navbar/footer updates. |
| `TOYVERSE_MENU_LINK_ORIGIN` | Storefront origin for footer Help links, e.g. `http://localhost:3000` (Saleor rejects bare `/shipping`). Final URLs: `{origin}/{channel}/path`. |
| `TOYVERSE_ATTACH_MEDIA_ON_REUSE` | Default **on**. When seed hits existing slugs (`TV-*`), attach demo image if product has **no** media (reuse skips `productCreate`, so images were missing before). |
| `TOYVERSE_REPAIR_PRODUCT_TYPES` | Set to `1` to **delete and recreate** any reused product whose Saleor product type slug does not match what the seed expects (e.g. fixes catalog stuck on **Audiobook** after an older run). |
| `TOYVERSE_WAREHOUSE_SLUG` | Pin stock to one warehouse by **slug** (e.g. `default-warehouse`). Use when auto-pick is wrong. |
| `TOYVERSE_WAREHOUSE_SLUGS` | Comma-separated slugs; **first match wins** (after `TOYVERSE_WAREHOUSE_SLUG` if set). |
| `TOYVERSE_SKIP_STOCK_SYNC_ON_REUSE` | If `1`, skip `productVariantStocksUpdate` when a product slug already exists (defaults to syncing so re-runs apply your warehouse choice). |
| `TOYVERSE_VARIANT_STOCK_QUANTITY` | Integer demo quantity per variant per warehouse API call (default `120`). |

```powershell
cd saleor-platform
set SALEOR_API_URL=http://localhost:8000/graphql/
set SALEOR_APP_TOKEN=your-app-token-here
set TOYVERSE_CHANNEL_SLUG=shop
python scripts/toyverse_seed.py
```

The script:

- Ensures **8 toy categories** with **English rich descriptions + SEO**, plus BN / Arabic (BH + AE) translations (slug-stable)
- Creates **40 demo toys** (5 per category) with **Editor.js descriptions**, **SEO**, **`productMediaCreate` demo images**, SKUs `TV-*`, inventory in a **channel-sensible** warehouse (prefers slugs/names like **Default** / **click & collect** over **Oceania**; override with `TOYVERSE_WAREHOUSE_SLUG`)
- Assigns a **Saleor product type per toy category** (variant slugs like `shirt` for **Top**, `beanie` for **Beanies & Scarfs**) — override via env or JSON; set `TOYVERSE_PRODUCT_TYPE_SLUG` to force one type for all
- Ensures collections **`featured-products`** and **`best-sellers`** and assigns products for homepage sections
- Clears and rebuilds **`navbar`** (collections + **default subset** of toy categories; use `TOYVERSE_NAVBAR_CATEGORY_SLUGS` for full list or a custom subset) and **`footer`** (category columns, collections, help links + BN/AR menu translations)

**Re-running:** Set `TOYVERSE_REPAIR_PRODUCT_TYPES=1` (plus app permissions) to delete/recreate rows stuck on the wrong Saleor type (including **Audiobook**). Otherwise reuse keeps existing products; the seed still **refreshes BN / Arabic product translations** and demo images when missing, and **updates variant stock** on the resolved primary warehouse via `productVariantStocksUpdate` (so `TOYVERSE_WAREHOUSE_SLUG` takes effect on re-seed). Stock lives in Saleor’s stock tables (e.g. `stock_stock` — not the `warehouse_warehouse` row itself).

**Storefront languages:** In Dashboard → Channel settings, enable **BN_BD**, **AR_BH**, and **AR_AE** (and English) so Saleor returns translations for menus, categories, and products.

**Images:** Saleor probes external URLs with **redirects disabled**. Hosts that answer **302** (including **`picsum.photos`**) return `UNSUPPORTED_MEDIA_PROVIDER`. Default seed URLs use **dummyimage.com** (direct PNG). If `productMediaCreate` warns, check outbound HTTPS from Core or override `TOYVERSE_IMAGE_BASE` with another host that returns **200 + image** immediately.

## 3. Storefront verification checklist

1. Browse homepage hero + featured / categories / best sellers (collections pull Saleor data).
2. Switch **EN_US ↔ BN_BD ↔ AR_BH ↔ AR_AE** — PDP / PLP / search / checkout mutations keep chosen language.
3. Add to cart, edit quantities, complete checkout (Dummy Payments path).
4. Register / login — unchanged flows.

## 4. Presentation polish tips

- Replace OG image `/opengraph-image.png` with ToyVerse artwork when ready.
- Swap fictional testimonials in `toyverse-testimonials.tsx` with production quotes when licensed.

Stripe / PSP integrations are intentionally **out of scope** for this demo phase.
