#!/usr/bin/env python3
"""
ToyVerse demo catalog — seeds categories, 40 toy products, collections, menus, images, and rich text.

Requires:
  - Python 3.10+
  - Saleor App token with MANAGE_PRODUCTS, MANAGE_TRANSLATIONS, and MANAGE_MENUS (menus)

Environment:
  SALEOR_API_URL            GraphQL endpoint (default: http://localhost:8000/graphql/)
  SALEOR_APP_TOKEN          Bearer token from Dashboard → Apps / extension
  TOYVERSE_CHANNEL_SLUG     Channel slug (default: default-channel)
  TOYVERSE_WAREHOUSE_SLUG   Optional exact warehouse slug to receive variant stock (e.g. default-warehouse)
  TOYVERSE_WAREHOUSE_SLUGS  Optional comma-separated list; first existing slug wins (after TOYVERSE_WAREHOUSE_SLUG if set)
  TOYVERSE_PRODUCT_TYPE_SLUG Optional. If set, every seeded product uses this Saleor product type slug (overrides per-category map).
  TOYVERSE_FALLBACK_PRODUCT_TYPE_SLUG Optional. When a mapped type is missing in Saleor (e.g. minimal DB has only shirt/shoe), try this slug first before built-in fallbacks.
  TOYVERSE_CATEGORY_PRODUCT_TYPES_JSON Optional JSON object: {"educational-toys":"shirt","baby-toys":"shoe", ...}
                               merges over built-in defaults (Saleor slugs, not Dashboard display names).
  TOYVERSE_IMAGE_BASE       Optional host for demo images (default https://dummyimage.com).
                               URLs must return HTTP 200 with an image Content-Type on first response —
                               Saleor follows no redirects when probing; ``picsum.photos`` (302) triggers UNSUPPORTED_MEDIA_PROVIDER.
  TOYVERSE_SKIP_MENUS       If "1", skip navbar/footer menu rebuild.
  TOYVERSE_MENU_LINK_ORIGIN Optional absolute storefront origin for footer Help links (default http://127.0.0.1:3000).
                               Saleor requires valid http(s) URLs; paths become {origin}/{channel}/...
  TOYVERSE_ATTACH_MEDIA_ON_REUSE Optional. Default on: when a product slug already exists, attach demo image if the product has no media (reuse skips full create flow otherwise).
                               On reuse, ToyVerse also sets stock on the resolved primary warehouse (parity with fresh productVariantCreate) unless TOYVERSE_SKIP_STOCK_SYNC_ON_REUSE=1.
  TOYVERSE_SKIP_STOCK_SYNC_ON_REUSE Optional. If "1", skip productVariantStocksUpdate when reusing an existing product slug (old behavior — warehouse env had no effect on re-runs).
  TOYVERSE_VARIANT_STOCK_QUANTITY Demo quantity passed to variant stock APIs (default 120).
  TOYVERSE_REPAIR_PRODUCT_TYPES Optional. If "1", when slug reuse finds wrong Saleor product type vs seed map, delete that product and recreate (fixes older runs stuck on Audiobook).
  TOYVERSE_NAVBAR_CATEGORY_SLUGS Optional comma-separated category slugs for the header menu only (footer keeps full list).
                               Use * or all for every seeded category. Default if unset: educational-toys,baby-toys,board-games,outdoor-toys.

Usage:
  cd saleor-platform
  set SALEOR_APP_TOKEN=...
  python scripts/toyverse_seed.py
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


API_URL = os.environ.get("SALEOR_API_URL", "http://localhost:8000/graphql/").strip()
TOKEN = os.environ.get("SALEOR_APP_TOKEN", "").strip()
CHANNEL_SLUG = os.environ.get("TOYVERSE_CHANNEL_SLUG", "default-channel").strip()
PRODUCT_TYPE_SLUG = os.environ.get("TOYVERSE_PRODUCT_TYPE_SLUG", "").strip()
IMAGE_BASE = os.environ.get("TOYVERSE_IMAGE_BASE", "https://dummyimage.com").strip().rstrip("/")
SKIP_MENUS = os.environ.get("TOYVERSE_SKIP_MENUS", "").strip().lower() in ("1", "true", "yes")
MENU_LINK_ORIGIN = os.environ.get("TOYVERSE_MENU_LINK_ORIGIN", "http://127.0.0.1:3000").strip().rstrip("/")
REPAIR_PRODUCT_TYPES = os.environ.get("TOYVERSE_REPAIR_PRODUCT_TYPES", "").strip().lower() in ("1", "true", "yes")
ATTACH_MEDIA_ON_REUSE = os.environ.get("TOYVERSE_ATTACH_MEDIA_ON_REUSE", "1").strip().lower() not in (
    "0",
    "false",
    "no",
)
SKIP_STOCK_SYNC_ON_REUSE = os.environ.get("TOYVERSE_SKIP_STOCK_SYNC_ON_REUSE", "").strip().lower() in (
    "1",
    "true",
    "yes",
)
try:
    SEED_VARIANT_STOCK_QTY = max(0, int(os.environ.get("TOYVERSE_VARIANT_STOCK_QUANTITY", "120").strip() or "120"))
except ValueError:
    SEED_VARIANT_STOCK_QTY = 120

EDITOR_VERSION = "2.24.3"

# When Saleor has no matching slug for a category map entry, try these (then any non-audiobook type).
_PRODUCT_TYPE_FALLBACK_CHAIN: tuple[str, ...] = ("shirt", "shoe", "beanie", "sweatshirt", "juice")

# Built-in Saleor demo DB slugs (Dashboard names differ): Top→shirt, Beanies & Scarfs→beanie, etc.
DEFAULT_CATEGORY_PRODUCT_TYPE_SLUG: dict[str, str] = {
    "educational-toys": "shirt",
    "baby-toys": "sweatshirt",
    "action-figures": "shoe",
    "dolls": "shirt",
    "board-games": "beanie",
    "outdoor-toys": "shoe",
    "arts-crafts": "sweatshirt",
    "remote-control-toys": "juice",
}

CATEGORIES: list[tuple[str, str, str, str]] = [
    ("Educational Toys", "educational-toys", "শিক্ষামূলক খেলনা", "ألعاب تعليمية"),
    ("Baby Toys", "baby-toys", "শিশুর খেলনা", "ألعاب للرضع"),
    ("Action Figures", "action-figures", "অ্যাকশন ফিগার", "مجسمات شخصيات أكشن"),
    ("Dolls", "dolls", "পুতুল", "دمى"),
    ("Board Games", "board-games", "বোর্ড গেম", "ألعاب لوحية"),
    ("Outdoor Toys", "outdoor-toys", "বাহিরের খেলনা", "ألعاب خارجية"),
    ("Arts & Crafts", "arts-crafts", "শিল্প ও হস্তশিল্প", "فنون وحِرف يدوية"),
    ("Remote Control Toys", "remote-control-toys", "রিমোট নিয়ন্ত্রিত খেলনা", "ألعاب تحكم عن بعد"),
]


def editor_document(blocks: list[dict[str, Any]]) -> str:
    """Saleor Draftail/Editor.js JSON (matches storefront editorjs-html parser)."""
    return json.dumps({"time": int(time.time() * 1000), "blocks": blocks, "version": EDITOR_VERSION})


def demo_category_description_en(name_en: str, slug: str) -> str:
    intro = (
        f"Explore {name_en.lower()} picked for the ToyVerse GCC storefront demo — playful palettes, "
        f"parent-friendly positioning, and structured metadata you can replace before production."
    )
    return editor_document(
        [
            {"id": "h1", "type": "header", "data": {"text": name_en, "level": 2}},
            {"id": "p1", "type": "paragraph", "data": {"text": intro}},
            {
                "id": "l1",
                "type": "list",
                "data": {
                    "style": "unordered",
                    "items": [
                        "Demo-safe merchandising copy (not compliance advice)",
                        "Works with multilingual PDP + PLP in this storefront",
                        f"Stable slug: {slug}",
                    ],
                },
            },
            {
                "id": "p2",
                "type": "paragraph",
                "data": {
                    "text": "Replace imagery, CE/GSO labeling, and importer details in Dashboard when you graduate from demo mode.",
                },
            },
        ],
    )


def demo_product_description_en(title: str, sku: str, aisle: str) -> str:
    return editor_document(
        [
            {"id": "h1", "type": "header", "data": {"text": title, "level": 2}},
            {
                "id": "p1",
                "type": "paragraph",
                "data": {
                    "text": (
                        f"{aisle} demo SKU {sku}. Ships from the ToyVerse seed script with inventory in your primary warehouse — "
                        "tune pricing, taxes, and fulfillment rules per channel."
                    ),
                },
            },
            {
                "id": "l1",
                "type": "list",
                "data": {
                    "style": "unordered",
                    "items": [
                        "Suggested ages: 3+ (adjust per SKU in Dashboard)",
                        "Battery policy: assume cells not included unless you add variant metadata",
                        "Packaging: retail-inspired placeholder positioning only",
                    ],
                },
            },
            {
                "id": "p2",
                "type": "paragraph",
                "data": {
                    "text": (
                        "Includes storefront-ready rich text so Description accordion renders immediately; swap blocks or attach "
                        "certificates using Saleor content tools."
                    ),
                },
            },
        ],
    )


def demo_product_description_bn(title_bn: str, sku: str) -> str:
    return editor_document(
        [
            {"id": "h1", "type": "header", "data": {"text": title_bn, "level": 2}},
            {
                "id": "p1",
                "type": "paragraph",
                "data": {
                    "text": (
                        f"ToyVerse ডেমো পণ্য · SKU {sku}. বাংলা অনুবাদ দেখানোর জন্য সমৃদ্ধ টেক্সট — "
                        "উৎপাদনের আগে অনুমোদিত কপি দিয়ে প্রতিস্থাপন করুন।"
                    ),
                },
            },
            {
                "id": "l1",
                "type": "list",
                "data": {
                    "style": "unordered",
                    "items": [
                        "বয়স নির্দেশিকা ও নিরাপত্তা তথ্য ড্যাশবোর্ডে যাচাই করুন",
                        "ইমেজ ও মিডিয়া ডেমো উদ্দেশ্যে — লাইসেন্সপ্রাপ্ত ছবি ব্যবহার করুন",
                    ],
                },
            },
        ],
    )


def demo_product_description_ar(title_ar: str, sku: str) -> str:
    return editor_document(
        [
            {"id": "h1", "type": "header", "data": {"text": title_ar, "level": 2}},
            {
                "id": "p1",
                "type": "paragraph",
                "data": {
                    "text": (
                        f"منتج ToyVerse التجريبي · الرمز {sku}. نص عربي غني لاختبار واجهة المتجر متعددة اللغات — "
                        "استبدل المحتوى قبل الإطلاق التجاري."
                    ),
                },
            },
            {
                "id": "l1",
                "type": "list",
                "data": {
                    "style": "unordered",
                    "items": [
                        "تحقق من الفئة العمرية وبيانات الامتثال في لوحة التحكم",
                        "الصور للعرض التوضيحي فقط — استخدم أصولًا مرخصة للإنتاج",
                    ],
                },
            },
        ],
    )


def gql(query: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
    if not TOKEN:
        print(
            "ERROR: Set SALEOR_APP_TOKEN (Dashboard → Apps → catalog + translations permissions).",
            file=sys.stderr,
        )
        sys.exit(1)
    payload = json.dumps({"query": query, "variables": variables or {}}).encode()
    req = urllib.request.Request(
        API_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {TOKEN}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            body = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        print(e.read().decode(), file=sys.stderr)
        raise SystemExit(1) from e

    if body.get("errors"):
        print(json.dumps(body["errors"], indent=2), file=sys.stderr)
        raise SystemExit(1)
    return body.get("data") or {}


def mutation_errors(data: dict[str, Any], key: str) -> list[dict[str, Any]]:
    obj = data.get(key) or {}
    return list(obj.get("errors") or [])


def index_variant_product_types(data: dict[str, Any]) -> dict[str, tuple[str, list[dict[str, Any]], str]]:
    """Map lowercase product type slug → (id, variantAttributes, display name).

    Only types with ``hasVariants`` appear here — Saleor demo rows like ``juice`` / ``beanie`` /
    ``sweatshirt`` often have no variants in DB, so this seed maps toys onto variant types (e.g. shirt, shoe).
    """
    index: dict[str, tuple[str, list[dict[str, Any]], str]] = {}
    for e in data.get("productTypes", {}).get("edges", []):
        n = e["node"]
        if not n.get("hasVariants", False):
            continue
        slug = (n.get("slug") or "").lower()
        index[slug] = (n["id"], n.get("variantAttributes") or [], n.get("name") or slug)
    if not index:
        raise SystemExit("No product type with variants found. Create one in Dashboard.")
    return index


def category_product_type_overrides_from_env() -> dict[str, str]:
    raw = os.environ.get("TOYVERSE_CATEGORY_PRODUCT_TYPES_JSON", "").strip()
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Invalid TOYVERSE_CATEGORY_PRODUCT_TYPES_JSON: {exc}") from exc
    if not isinstance(parsed, dict):
        raise SystemExit("TOYVERSE_CATEGORY_PRODUCT_TYPES_JSON must be a JSON object.")
    return {str(k).lower(): str(v).lower() for k, v in parsed.items()}


def merged_category_product_type_map() -> dict[str, str]:
    merged = dict(DEFAULT_CATEGORY_PRODUCT_TYPE_SLUG)
    merged.update(category_product_type_overrides_from_env())
    missing = [s for _, s, _, _ in CATEGORIES if s not in merged]
    if missing:
        raise SystemExit(
            "ToyVerse category slugs missing from product-type map: "
            + ", ".join(missing)
            + ". Edit DEFAULT_CATEGORY_PRODUCT_TYPE_SLUG or set TOYVERSE_CATEGORY_PRODUCT_TYPES_JSON.",
        )
    return merged


def resolve_product_type_for_category(
    category_slug: str,
    pt_index: dict[str, tuple[str, list[dict[str, Any]], str]],
    cat_to_pt: dict[str, str],
) -> tuple[str, list[dict[str, Any]], str, str]:
    forced = bool(PRODUCT_TYPE_SLUG)
    slug_wanted = PRODUCT_TYPE_SLUG.lower() if PRODUCT_TYPE_SLUG else cat_to_pt[category_slug]
    if slug_wanted in pt_index:
        pid, attrs, pname = pt_index[slug_wanted]
        return pid, attrs, slug_wanted, pname

    available = ", ".join(sorted(pt_index.keys()))
    if forced:
        raise SystemExit(
            f"Product type slug {slug_wanted!r} not found (TOYVERSE_PRODUCT_TYPE_SLUG). Available variant types: {available}",
        )

    env_fb = os.environ.get("TOYVERSE_FALLBACK_PRODUCT_TYPE_SLUG", "").strip().lower()
    candidates: list[str] = []
    if env_fb and env_fb in pt_index:
        candidates.append(env_fb)
    candidates.extend(s for s in _PRODUCT_TYPE_FALLBACK_CHAIN if s in pt_index and s not in candidates)
    for k in sorted(pt_index.keys()):
        if k != "audiobook" and k not in candidates:
            candidates.append(k)

    for slug_used in candidates:
        pid, attrs, pname = pt_index[slug_used]
        print(
            f"ToyVerse: category {category_slug!r} wants product type {slug_wanted!r} (missing); using {slug_used!r}.",
            file=sys.stderr,
        )
        return pid, attrs, slug_used, pname

    if "audiobook" in pt_index:
        print(
            "ToyVerse: only variant product type is 'audiobook'; using it. Add shirt/shoe in Dashboard or set "
            "TOYVERSE_FALLBACK_PRODUCT_TYPE_SLUG / TOYVERSE_PRODUCT_TYPE_SLUG.",
            file=sys.stderr,
        )
        pid, attrs, pname = pt_index["audiobook"]
        return pid, attrs, "audiobook", pname

    raise SystemExit(
        f"Product type slug {slug_wanted!r} not found. Available variant types: {available}",
    )


def attribute_value_inputs(attr_defs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    inputs: list[dict[str, Any]] = []
    for va in attr_defs:
        attr = va.get("attribute") or va
        aid = attr.get("id")
        slug = attr.get("slug", "attr")
        input_type = (attr.get("inputType") or "PLAIN_TEXT").upper()
        if input_type in ("DROPDOWN", "SWATCH", "MULTISELECT"):
            q = """
            query A($id: ID!) {
              attribute(id: $id) {
                choices(first: 20) {
                  edges { node { id slug name } }
                }
              }
            }
            """
            data = gql(q, {"id": aid})
            choices = (((data.get("attribute") or {}).get("choices") or {}).get("edges")) or []
            if input_type == "MULTISELECT":
                if choices:
                    cid = choices[0]["node"]["id"]
                    inputs.append({"id": aid, "multiselect": [{"id": cid}]})
                else:
                    inputs.append({"id": aid, "multiselect": [{"value": f"toyverse-{slug}"}]})
            elif choices:
                cid = choices[0]["node"]["id"]
                field = "dropdown" if input_type != "SWATCH" else "swatch"
                inputs.append({"id": aid, field: {"id": cid}})
            else:
                field = "dropdown" if input_type != "SWATCH" else "swatch"
                inputs.append({"id": aid, field: {"value": f"toyverse-{slug}"}})
        elif input_type == "BOOLEAN":
            inputs.append({"id": aid, "boolean": True})
        elif input_type == "NUMERIC":
            inputs.append({"id": aid, "numeric": "1"})
        else:
            inputs.append({"id": aid, "plainText": "ToyVerse demo"})
    return inputs


def ensure_category(name_en: str, slug: str) -> str:
    q_find = """
    query CatSlugs($slugs: [String!]!) {
      categories(first: 20, filter: { slugs: $slugs }) {
        edges { node { id slug } }
      }
    }
    """
    data = gql(q_find, {"slugs": [slug]})
    edges = data.get("categories", {}).get("edges", [])
    if edges:
        return edges[0]["node"]["id"]

    m = """
    mutation CatCreate($input: CategoryInput!) {
      categoryCreate(input: $input) {
        category { id slug }
        errors { field message code }
      }
    }
    """
    data = gql(m, {"input": {"name": name_en, "slug": slug}})
    errs = mutation_errors(data, "categoryCreate")
    if errs:
        raise RuntimeError(errs)
    return data["categoryCreate"]["category"]["id"]


def category_update_rich_en(cid: str, name_en: str, description_json: str, seo_title: str, seo_description: str) -> None:
    m = """
    mutation CU($id: ID!, $input: CategoryInput!) {
      categoryUpdate(id: $id, input: $input) {
        errors { field message code }
      }
    }
    """
    data = gql(
        m,
        {
            "id": cid,
            "input": {
                "name": name_en,
                "description": description_json,
                "seo": {"title": seo_title, "description": seo_description},
            },
        },
    )
    errs = mutation_errors(data, "categoryUpdate")
    if errs:
        print(f"categoryUpdate warnings:", errs, file=sys.stderr)


def translate_category_rich(cid: str, lang: str, name: str, description_doc_json: str) -> None:
    m = """
    mutation CatTr($id: ID!, $lang: LanguageCodeEnum!, $input: TranslationInput!) {
      categoryTranslate(id: $id, languageCode: $lang, input: $input) {
        errors { field message code }
      }
    }
    """
    data = gql(m, {"id": cid, "lang": lang, "input": {"name": name, "description": description_doc_json}})
    errs = mutation_errors(data, "categoryTranslate")
    if errs:
        print(f"categoryTranslate {lang} warnings:", errs, file=sys.stderr)


def ensure_collection(slug: str, name: str) -> str:
    """Return collection ID; reuse existing slug even if not visible on this channel yet."""
    q_channel = """
    query Col($slug: String!, $channel: String!) {
      collection(slug: $slug, channel: $channel) {
        id
        slug
      }
    }
    """
    data = gql(q_channel, {"slug": slug, "channel": CHANNEL_SLUG})
    col = data.get("collection")
    if col:
        return col["id"]

    q_by_slug = """
    query CollBySlug($slugs: [String!]!) {
      collections(first: 10, filter: { slugs: $slugs }) {
        edges { node { id slug } }
      }
    }
    """
    data = gql(q_by_slug, {"slugs": [slug]})
    edges = (data.get("collections") or {}).get("edges") or []
    if edges:
        return edges[0]["node"]["id"]

    m = """
    mutation ColCreate($input: CollectionCreateInput!) {
      collectionCreate(input: $input) {
        collection { id slug }
        errors { field message code }
      }
    }
    """
    data = gql(m, {"input": {"name": name, "slug": slug}})
    errs = mutation_errors(data, "collectionCreate")
    if errs:
        msg = " ".join((e.get("message") or "") for e in errs).lower()
        if "already exists" in msg or any(e.get("field") == "slug" for e in errs):
            data = gql(q_by_slug, {"slugs": [slug]})
            edges = (data.get("collections") or {}).get("edges") or []
            if edges:
                print(f"  collection {slug!r} already exists — reusing existing ID.", file=sys.stderr)
                return edges[0]["node"]["id"]
        raise RuntimeError(errs)
    return data["collectionCreate"]["collection"]["id"]


def collection_add_products(cid: str, pids: list[str]) -> None:
    if not pids:
        return
    m = """
    mutation Cap($id: ID!, $products: [ID!]!) {
      collectionAddProducts(collectionId: $id, products: $products) {
        collection { id }
        errors { field message code }
      }
    }
    """
    data = gql(m, {"id": cid, "products": pids})
    errs = mutation_errors(data, "collectionAddProducts")
    if errs:
        print("collectionAddProducts warnings:", errs, file=sys.stderr)


def product_media_from_url(product_id: str, image_url: str, alt: str) -> None:
    m = """
    mutation PMC($input: ProductMediaCreateInput!) {
      productMediaCreate(input: $input) {
        errors { field message code }
      }
    }
    """
    data = gql(m, {"input": {"product": product_id, "mediaUrl": image_url, "alt": alt}})
    errs = mutation_errors(data, "productMediaCreate")
    if errs:
        print(f"productMediaCreate warning ({alt}):", errs, file=sys.stderr)
    else:
        print(f"  media mirrored: {image_url}", file=sys.stderr)


def product_admin_snapshot(product_id: str) -> dict[str, Any] | None:
    """Staff API snapshot for reuse/repair (product type + media)."""
    q = """
    query PSnap($id: ID!) {
      product(id: $id) {
        productType { slug }
        media { id }
      }
    }
    """
    data = gql(q, {"id": product_id})
    node = data.get("product")
    return node if isinstance(node, dict) else None


def ensure_product_demo_media(product_id: str, sku: str, title: str) -> None:
    """If product has no media, mirror demo image (reuse path skips create_product_flow)."""
    snap = product_admin_snapshot(product_id)
    if not snap:
        print(f"ensure_product_demo_media: product id not resolved {product_id!r}", file=sys.stderr)
        return
    media = snap.get("media") or []
    if media:
        return
    product_media_from_url(product_id, product_image_url(sku), f"{title} — ToyVerse demo photo")


def product_delete(product_id: str) -> bool:
    m = """
    mutation PD($id: ID!) {
      productDelete(id: $id) {
        errors { field message code }
      }
    }
    """
    data = gql(m, {"id": product_id})
    errs = mutation_errors(data, "productDelete")
    if errs:
        print(f"productDelete warnings {product_id!r}:", errs, file=sys.stderr)
        return False
    return True


def collect_menu_item_ids_post_order(items: list[dict[str, Any]]) -> list[str]:
    """Children before parents (safe for bulk delete)."""
    ids: list[str] = []
    for it in items or []:
        ids.extend(collect_menu_item_ids_post_order(it.get("children") or []))
        ids.append(it["id"])
    return ids


def menu_fetch(slug: str) -> dict[str, Any] | None:
    q = """
    query MenuSeed($slug: String!, $channel: String!) {
      menu(slug: $slug, channel: $channel) {
        id
        items {
          id
          children {
            id
            children {
              id
              children { id }
            }
          }
        }
      }
    }
    """
    data = gql(q, {"slug": slug, "channel": CHANNEL_SLUG})
    return data.get("menu")


def menu_clear_and_get_id(slug: str) -> str | None:
    menu = menu_fetch(slug)
    if not menu:
        print(f"  menu missing slug={slug!r} — create '{slug}' menu in Dashboard.", file=sys.stderr)
        return None
    ids = collect_menu_item_ids_post_order(menu.get("items") or [])
    if ids:
        m = """
        mutation MBD($ids: [ID!]!) {
          menuItemBulkDelete(ids: $ids) {
            errors { message code }
          }
        }
        """
        data = gql(m, {"ids": ids})
        errs = mutation_errors(data, "menuItemBulkDelete")
        if errs:
            print(f"menuItemBulkDelete {slug} warnings:", errs, file=sys.stderr)
    return menu["id"]


def menu_item_create(menu_id: str, name: str, parent: str | None = None, **kwargs: Any) -> str | None:
    inp: dict[str, Any] = {"name": name, "menu": menu_id}
    if parent:
        inp["parent"] = parent
    for key in ("category", "collection", "page", "url"):
        if kwargs.get(key) is not None:
            inp[key] = kwargs[key]
    m = """
    mutation MIC($input: MenuItemCreateInput!) {
      menuItemCreate(input: $input) {
        menuItem { id }
        errors { field message code }
      }
    }
    """
    data = gql(m, {"input": inp})
    errs = mutation_errors(data, "menuItemCreate")
    if errs:
        print(f"menuItemCreate {name!r} warnings:", errs, file=sys.stderr)
        return None
    return data["menuItemCreate"]["menuItem"]["id"]


def seed_navbar(menu_id: str, feat_id: str, best_id: str, category_links: list[tuple[str, str, str]]) -> None:
    """Flat navbar: collections first, then toy categories (matches NavLinks)."""
    menu_item_create(menu_id, "Featured picks", collection=feat_id)
    menu_item_create(menu_id, "Best sellers", collection=best_id)
    for name_en, _slug, cid in category_links:
        menu_item_create(menu_id, name_en, category=cid)


def demo_category_description_bn(name_bn: str, slug: str) -> str:
    return editor_document(
        [
            {"id": "h1", "type": "header", "data": {"text": name_bn, "level": 2}},
            {
                "id": "p1",
                "type": "paragraph",
                "data": {
                    "text": (
                        f"ToyVerse ডেমো বিভাগ · স্লাগ {slug}. বহুভাষিক হোম ও বিভাগ পৃষ্ঠার জন্য সমৃদ্ধ বিবরণ।"
                    ),
                },
            },
            {
                "id": "l1",
                "type": "list",
                "data": {
                    "style": "unordered",
                    "items": ["ড্যাশবোর্ডে ছবি ও অনুলিপি প্রতিস্থাপন করুন", "ইউআই পরীক্ষায় স্থির স্লাগ ব্যবহার করুন"],
                },
            },
        ],
    )


def demo_category_description_ar(name_ar: str, slug: str, region: str) -> str:
    return editor_document(
        [
            {"id": "h1", "type": "header", "data": {"text": name_ar, "level": 2}},
            {
                "id": "p1",
                "type": "paragraph",
                "data": {
                    "text": (
                        f"قسم ToyVerse التجريبي ({region}) · المسار {slug}. نص عربي غني لاختبار التصنيفات."
                    ),
                },
            },
            {
                "id": "l1",
                "type": "list",
                "data": {
                    "style": "unordered",
                    "items": [
                        "حدّث الصور والوصف من لوحة التحكم قبل الإطلاق",
                        "الشارات التنظيمية للعرض التوضيحي فقط",
                    ],
                },
            },
        ],
    )


def navbar_category_links(rows: list[tuple[str, str, str]]) -> list[tuple[str, str, str]]:
    """Subset of categories linked from the header navbar (footer unchanged).

    ``rows`` entries are ``(english_name, category_slug, category_relay_id)``.
    """
    raw = os.environ.get("TOYVERSE_NAVBAR_CATEGORY_SLUGS", "").strip()
    if raw in ("*", "all", "ALL"):
        return rows
    if raw:
        wanted = {p.strip().lower() for p in raw.split(",") if p.strip()}
        return [(name, slug, cid) for name, slug, cid in rows if slug.lower() in wanted]
    keep = {"educational-toys", "baby-toys", "board-games", "outdoor-toys"}
    return [(name, slug, cid) for name, slug, cid in rows if slug.lower() in keep]


def translate_collection_name(collection_id: str, lang: str, name: str) -> None:
    m = """
    mutation ColTr($id: ID!, $lang: LanguageCodeEnum!, $input: TranslationInput!) {
      collectionTranslate(id: $id, languageCode: $lang, input: $input) {
        errors { field message code }
      }
    }
    """
    data = gql(m, {"id": collection_id, "lang": lang, "input": {"name": name}})
    errs = mutation_errors(data, "collectionTranslate")
    if errs:
        print(f"collectionTranslate {lang} warnings:", errs, file=sys.stderr)


def translate_menu_item_name(menu_item_id: str, lang: str, name: str) -> None:
    m = """
    mutation MiTr($id: ID!, $lang: LanguageCodeEnum!, $input: NameTranslationInput!) {
      menuItemTranslate(id: $id, languageCode: $lang, input: $input) {
        errors { field message code }
      }
    }
    """
    data = gql(m, {"id": menu_item_id, "lang": lang, "input": {"name": name}})
    errs = mutation_errors(data, "menuItemTranslate")
    if errs:
        print(f"menuItemTranslate {lang} warnings:", errs, file=sys.stderr)


def seed_collection_translations(feat_id: str, best_id: str) -> None:
    translate_collection_name(feat_id, "BN_BD", "ফিচার্ড পণ্য")
    translate_collection_name(feat_id, "AR_BH", "منتجات مميزة")
    translate_collection_name(feat_id, "AR_AE", "منتجات مميزة")
    translate_collection_name(best_id, "BN_BD", "বেস্টসেলার")
    translate_collection_name(best_id, "AR_BH", "الأكثر مبيعًا")
    translate_collection_name(best_id, "AR_AE", "الأكثر مبيعًا")


def storefront_menu_url(path: str) -> str:
    """Saleor validates menu URLs as http(s); include channel segment for this storefront."""
    p = path if path.startswith("/") else f"/{path}"
    return f"{MENU_LINK_ORIGIN}/{CHANNEL_SLUG}{p}"


def seed_footer(menu_id: str, feat_id: str, best_id: str, category_links: list[tuple[str, str, str]]) -> None:
    """Footer columns: categories + collections + help URLs (matches Footer.tsx hierarchy)."""
    shop_id = menu_item_create(menu_id, "Shop categories")
    if shop_id:
        translate_menu_item_name(shop_id, "BN_BD", "শপের বিভাগসমূহ")
        translate_menu_item_name(shop_id, "AR_BH", "أقسام المتجر")
        translate_menu_item_name(shop_id, "AR_AE", "أقسام المتجر")
        for name_en, _slug, cid in category_links:
            menu_item_create(menu_id, name_en, parent=shop_id, category=cid)

    col_id = menu_item_create(menu_id, "Collections")
    if col_id:
        translate_menu_item_name(col_id, "BN_BD", "কালেকশন")
        translate_menu_item_name(col_id, "AR_BH", "المجموعات")
        translate_menu_item_name(col_id, "AR_AE", "المجموعات")
        menu_item_create(menu_id, "Featured picks", parent=col_id, collection=feat_id)
        menu_item_create(menu_id, "Best sellers", parent=col_id, collection=best_id)

    help_id = menu_item_create(menu_id, "Help")
    if help_id:
        translate_menu_item_name(help_id, "BN_BD", "সাহায্য")
        translate_menu_item_name(help_id, "AR_BH", "المساعدة")
        translate_menu_item_name(help_id, "AR_AE", "المساعدة")
        help_entries: list[tuple[str, str, dict[str, str]]] = [
            ("Shipping (GCC demo)", "/shipping", {"BN_BD": "শিপিং (GCC ডেমো)", "AR_BH": "الشحن", "AR_AE": "الشحن"}),
            ("Returns & safety", "/returns", {"BN_BD": "রিটার্ন ও নিরাপত্তা", "AR_BH": "الإرجاع والسلامة", "AR_AE": "الإرجاع والسلامة"}),
            ("FAQs", "/faq", {"BN_BD": "প্রশ্নোত্তর", "AR_BH": "الأسئلة الشائعة", "AR_AE": "الأسئلة الشائعة"}),
            ("Contact", "/contact", {"BN_BD": "যোগাযোগ", "AR_BH": "تواصل", "AR_AE": "تواصل"}),
        ]
        for label_en, path, tr in help_entries:
            hid = menu_item_create(menu_id, label_en, parent=help_id, url=storefront_menu_url(path))
            if hid:
                translate_menu_item_name(hid, "BN_BD", tr["BN_BD"])
                translate_menu_item_name(hid, "AR_BH", tr["AR_BH"])
                translate_menu_item_name(hid, "AR_AE", tr["AR_AE"])


def product_id_if_exists(slug: str) -> str | None:
    """Resolve product ID when slug already exists (re-seed / duplicate run)."""
    q_one = """
    query ProdSlug($slug: String!, $channel: String!) {
      product(slug: $slug, channel: $channel) {
        id
      }
    }
    """
    data = gql(q_one, {"slug": slug, "channel": CHANNEL_SLUG})
    node = data.get("product")
    if node:
        return node["id"]
    q_list = """
    query ProdSlugs($slugs: [String!]!, $channel: String!) {
      products(first: 5, channel: $channel, filter: { slugs: $slugs }) {
        edges {
          node {
            id
            slug
          }
        }
      }
    }
    """
    data = gql(q_list, {"slugs": [slug], "channel": CHANNEL_SLUG})
    edges = (data.get("products") or {}).get("edges") or []
    if edges:
        return edges[0]["node"]["id"]
    return None


# Placeholder palette — deterministic per SKU (dummyimage returns PNG without redirects).
_DEMO_IMAGE_BG_HEX = ("3949ab", "00897b", "f4511e", "6d4c41", "7cb342", "5e35b1", "c2185b", "0097a7")


def product_image_url(sku: str) -> str:
    safe = sku.lower().replace("#", "").replace(" ", "-")
    bg = _DEMO_IMAGE_BG_HEX[sum(map(ord, safe)) % len(_DEMO_IMAGE_BG_HEX)]
    label = urllib.parse.quote(safe)
    return f"{IMAGE_BASE}/800x800/{bg}/eeeeee.png&text={label}"


def apply_product_translations(product_id: str, translations: list[tuple[str, str, str]]) -> None:
    for lang, t_name, t_desc in translations:
        m_tr = """
        mutation PT($id: ID!, $lang: LanguageCodeEnum!, $input: TranslationInput!) {
          productTranslate(id: $id, languageCode: $lang, input: $input) {
            errors { field message code }
          }
        }
        """
        data = gql(
            m_tr,
            {
                "id": product_id,
                "lang": lang,
                "input": {
                    "name": t_name,
                    "description": t_desc,
                },
            },
        )
        errs = mutation_errors(data, "productTranslate")
        if errs:
            print(f"productTranslate {lang} warnings:", errs, file=sys.stderr)


def create_product_flow(
    *,
    channel_id: str,
    warehouse_id: str,
    category_id: str,
    product_type_id: str,
    variant_attrs: list[dict[str, Any]],
    name: str,
    slug: str,
    sku: str,
    price: str,
    description_json: str,
    seo: dict[str, str],
    translations: list[tuple[str, str, str]],
) -> str:
    m_prod = """
    mutation PC($input: ProductCreateInput!) {
      productCreate(input: $input) {
        product { id }
        errors { field message code }
      }
    }
    """
    data = gql(
        m_prod,
        {
            "input": {
                "name": name,
                "slug": slug,
                "productType": product_type_id,
                "category": category_id,
                "description": description_json,
                "seo": {"title": seo["title"], "description": seo["description"]},
            },
        },
    )
    errs = mutation_errors(data, "productCreate")
    if errs:
        raise RuntimeError(errs)
    pid = data["productCreate"]["product"]["id"]

    attr_inputs = attribute_value_inputs(variant_attrs)
    m_var = """
    mutation PVC($input: ProductVariantCreateInput!) {
      productVariantCreate(input: $input) {
        productVariant { id }
        errors { field message code }
      }
    }
    """
    data = gql(
        m_var,
        {
            "input": {
                "product": pid,
                "sku": sku,
                "trackInventory": True,
                "attributes": attr_inputs,
                "stocks": [{"warehouse": warehouse_id, "quantity": SEED_VARIANT_STOCK_QTY}],
            },
        },
    )
    errs = mutation_errors(data, "productVariantCreate")
    if errs:
        raise RuntimeError(errs)
    vid = data["productVariantCreate"]["productVariant"]["id"]

    m_pch = """
    mutation PCH($id: ID!, $input: ProductChannelListingUpdateInput!) {
      productChannelListingUpdate(id: $id, input: $input) {
        product { id }
        errors { field message code }
      }
    }
    """
    data = gql(
        m_pch,
        {
            "id": pid,
            "input": {
                "updateChannels": [
                    {
                        "channelId": channel_id,
                        "isPublished": True,
                        "visibleInListings": True,
                        "isAvailableForPurchase": True,
                        "addVariants": [vid],
                    },
                ],
            },
        },
    )
    errs = mutation_errors(data, "productChannelListingUpdate")
    if errs:
        raise RuntimeError(errs)

    m_price = """
    mutation PVCL($id: ID!, $input: [ProductVariantChannelListingAddInput!]!) {
      productVariantChannelListingUpdate(id: $id, input: $input) {
        variant { id }
        errors { field message code }
      }
    }
    """
    data = gql(
        m_price,
        {"id": vid, "input": [{"channelId": channel_id, "price": price}]},
    )
    errs = mutation_errors(data, "productVariantChannelListingUpdate")
    if errs:
        raise RuntimeError(errs)

    product_media_from_url(pid, product_image_url(sku), f"{name} — ToyVerse demo photo")

    apply_product_translations(pid, translations)

    return pid


def sync_product_variants_stock_to_warehouse(product_id: str, warehouse_id: str, quantity: int) -> None:
    """Set ``quantity`` in ``warehouse_id`` for every variant via productVariantStocksUpdate (slug-reuse parity)."""
    if quantity <= 0:
        return
    q_vars = """
    query Pvars($id: ID!) {
      product(id: $id) {
        variants {
          id
          sku
        }
      }
    }
    """
    data = gql(q_vars, {"id": product_id})
    prod = data.get("product")
    if not prod:
        return
    variants = prod.get("variants") or []
    if not variants:
        return
    m_stocks = """
    mutation PVStocks($variantId: ID!, $stocks: [StockInput!]!) {
      productVariantStocksUpdate(variantId: $variantId, stocks: $stocks) {
        productVariant { id }
        errors { field code message }
      }
    }
    """
    for v in variants:
        data = gql(
            m_stocks,
            {
                "variantId": v["id"],
                "stocks": [{"warehouse": warehouse_id, "quantity": quantity}],
            },
        )
        errs = mutation_errors(data, "productVariantStocksUpdate")
        if errs:
            print(f"  productVariantStocksUpdate SKU={v.get('sku')!r}:", errs, file=sys.stderr)


def pick_primary_warehouse_id() -> str:
    """Choose a warehouse for variant stock — do not blindly use warehouses(first:N)[0].

    PopulateDB/Dashboard setups often put **Oceania** first; channel shipping zones for a local
    ``shop`` channel usually fulfill from **Default** warehouses instead, so storefront checkout
    saw "0 remaining" despite stock on Oceania.

    Priority:
      1. ``TOYVERSE_WAREHOUSE_SLUG`` (single) or ``TOYVERSE_WAREHOUSE_SLUGS`` (comma list, first match)
      2. Otherwise pick the warehouse that best matches slug/name hints (``default``, ``warehouse``,
         ``click``, ``collect``) and **deprioritize** ``oceania``.
    """

    slug_override = os.environ.get("TOYVERSE_WAREHOUSE_SLUG", "").strip()
    list_override = os.environ.get("TOYVERSE_WAREHOUSE_SLUGS", "").strip()

    overrides: list[str] = []
    if slug_override:
        overrides.append(slug_override)
    if list_override:
        overrides.extend([s.strip() for s in list_override.split(",") if s.strip()])

    wh_data = gql("{ warehouses(first: 50) { edges { node { id slug name } } } }")
    edges = wh_data["warehouses"]["edges"]
    if not edges:
        raise SystemExit("No warehouses found. Create one in Dashboard.")
    nodes: list[dict[str, Any]] = [e["node"] for e in edges]

    if overrides:
        by_slug = {(n["slug"] or "").lower(): n["id"] for n in nodes}
        for want in overrides:
            wid = by_slug.get(want.lower())
            if wid:
                print(f"  warehouse (explicit): slug={want!r}")
                return wid
        known = sorted(by_slug.keys())
        raise SystemExit(
            "No warehouse matches TOYVERSE_WAREHOUSE_SLUG(S)="
            + repr(overrides)
            + f". Existing slugs: {known}",
        )

    def score_wh(n: dict[str, Any]) -> tuple[int, str]:
        slug = (n.get("slug") or "").lower()
        name = (n.get("name") or "").lower()
        s = 0
        if "oceania" in slug or "oceania" in name:
            s -= 300
        for token in ("default", "click", "collect", "central", "main"):
            if token in slug or token in name:
                s += 40
        # plain "warehouse" word — weaker than explicit default
        if "warehouse" in slug or "warehouse" in name:
            s += 20
        return (s, slug)

    chosen = max(nodes, key=score_wh)
    print(
        "  warehouse (auto): slug="
        + repr(chosen.get("slug"))
        + " name="
        + repr(chosen.get("name"))
        + " (set TOYVERSE_WAREHOUSE_SLUG to pin another)",
        file=sys.stderr,
    )
    return chosen["id"]


def build_products() -> list[dict[str, Any]]:
    toys: list[dict[str, Any]] = []
    idx = 0
    for name_en, slug, bn_hint, ar_hint in CATEGORIES:
        for n in range(5):
            idx += 1
            piece = name_en.split()[0]
            toys.append(
                {
                    "name_en": f"{piece} Wonder Pack #{n + 1}",
                    "slug": f"{slug}-{n + 1}",
                    "sku": f"TV-{idx:03d}",
                    "category_slug": slug,
                    "aisle_en": name_en,
                    "price": f"{(9.5 + (idx % 11) * 2.25):.2f}",
                    "name_bn": f"{bn_hint} · প্যাক {n + 1}",
                    "name_ar": f"{ar_hint} · حزمة {n + 1}",
                },
            )
    return toys[:40]


def main() -> None:
    print(f"ToyVerse seed → {API_URL} (channel={CHANNEL_SLUG})")
    if REPAIR_PRODUCT_TYPES:
        print(
            "ToyVerse: TOYVERSE_REPAIR_PRODUCT_TYPES=1 — products whose Saleor type ≠ seed map will be deleted and recreated.",
            file=sys.stderr,
        )

    ch_data = gql(
        """
        query Ch {
          channels {
            id
            slug
            isActive
          }
        }
        """
    )
    channel_id = None
    for ch in ch_data.get("channels") or []:
        if ch.get("slug") == CHANNEL_SLUG and ch.get("isActive"):
            channel_id = ch["id"]
            break
    if not channel_id:
        raise SystemExit(f"Active channel slug not found: {CHANNEL_SLUG}")

    warehouse_id = pick_primary_warehouse_id()

    pt_query = """
    query PT {
      productTypes(first: 50) {
        edges {
          node {
            id
            slug
            name
            hasVariants
            variantAttributes {
              id
              slug
              inputType
            }
          }
        }
      }
    }
    """
    pt_data = gql(pt_query)
    pt_index = index_variant_product_types(pt_data)
    cat_pt_map = merged_category_product_type_map()

    if PRODUCT_TYPE_SLUG:
        print(f"All products use forced type slug {PRODUCT_TYPE_SLUG!r} (TOYVERSE_PRODUCT_TYPE_SLUG).")
    else:
        print("Per-category Saleor product types (slug → slug):")
        for _, cat_slug, _, _ in CATEGORIES:
            print(f"  {cat_slug} → {cat_pt_map[cat_slug]}")

    cat_ids: dict[str, str] = {}
    category_nav_order: list[tuple[str, str, str]] = []

    for name_en, slug, bn, ar in CATEGORIES:
        cid = ensure_category(name_en, slug)
        cat_ids[slug] = cid
        category_nav_order.append((name_en, slug, cid))

        desc_en = demo_category_description_en(name_en, slug)
        category_update_rich_en(
            cid,
            name_en,
            desc_en,
            seo_title=f"{name_en} | ToyVerse",
            seo_description=f"ToyVerse demo aisle — {name_en}. GCC-inspired toy storefront.",
        )

        translate_category_rich(cid, "BN_BD", bn, demo_category_description_bn(bn, slug))
        translate_category_rich(cid, "AR_BH", ar, demo_category_description_ar(ar, slug, "البحرين"))
        translate_category_rich(cid, "AR_AE", ar, demo_category_description_ar(ar, slug, "الإمارات"))

        print(f"  category OK {slug}")

    feat_id = ensure_collection("featured-products", "Featured products")
    best_id = ensure_collection("best-sellers", "Best sellers")
    print(f"Collections: featured={feat_id} best={best_id}")
    seed_collection_translations(feat_id, best_id)

    if not SKIP_MENUS:
        nb = menu_clear_and_get_id("navbar")
        if nb:
            seed_navbar(nb, feat_id, best_id, navbar_category_links(category_nav_order))
            print("  navbar menu rebuilt")
        ft = menu_clear_and_get_id("footer")
        if ft:
            seed_footer(ft, feat_id, best_id, category_nav_order)
            print("  footer menu rebuilt")
    else:
        print("  skipping menus (TOYVERSE_SKIP_MENUS)")

    toys = build_products()
    product_ids: list[str] = []
    for t in toys:
        cid = cat_ids[t["category_slug"]]
        title = t["name_en"]
        sku = t["sku"]
        desc_en = demo_product_description_en(title, sku, t["aisle_en"])
        desc_bn = demo_product_description_bn(t["name_bn"], sku)
        desc_ar = demo_product_description_ar(t["name_ar"], sku)
        seo = {
            "title": f"{title} | ToyVerse",
            "description": f"{t['aisle_en']} demo SKU {sku}. ToyVerse multilingual storefront.",
        }
        product_type_id, variant_attrs, pt_slug, pt_name = resolve_product_type_for_category(
            t["category_slug"], pt_index, cat_pt_map
        )
        try:
            pid = create_product_flow(
                channel_id=channel_id,
                warehouse_id=warehouse_id,
                category_id=cid,
                product_type_id=product_type_id,
                variant_attrs=variant_attrs,
                name=title,
                slug=t["slug"],
                sku=sku,
                price=t["price"],
                description_json=desc_en,
                seo=seo,
                translations=[
                    ("BN_BD", t["name_bn"], desc_bn),
                    ("AR_BH", t["name_ar"], desc_ar),
                    ("AR_AE", t["name_ar"], desc_ar),
                ],
            )
            product_ids.append(pid)
            print(f"  product OK {sku} {t['slug']} type={pt_slug!r} ({pt_name})")
        except RuntimeError as e:
            args = e.args[0] if e.args else ()
            errs = args if isinstance(args, list) else ()
            slug_conflict = bool(
                errs
                and any(
                    isinstance(x, dict) and x.get("field") == "slug" and x.get("code") == "UNIQUE" for x in errs
                ),
            )
            if slug_conflict:
                existing = product_id_if_exists(t["slug"])
                if existing:
                    repaired = False
                    if REPAIR_PRODUCT_TYPES:
                        snap = product_admin_snapshot(existing)
                        pt_cur = ((snap or {}).get("productType") or {}).get("slug") or ""
                        pt_cur = pt_cur.lower()
                        forced_audiobook = bool(PRODUCT_TYPE_SLUG) and PRODUCT_TYPE_SLUG.lower() == "audiobook"
                        wants_diff_type = bool(pt_cur) and pt_cur != pt_slug.lower()
                        audiobook_stuck = bool(pt_cur) and pt_cur == "audiobook" and not forced_audiobook
                        if audiobook_stuck or wants_diff_type:
                            reason = "Audiobook cleanup" if audiobook_stuck else "product type mismatch"
                            print(
                                f"  repair ({reason}): {pt_cur!r} → want {pt_slug!r} — delete & recreate {sku}",
                                file=sys.stderr,
                            )
                            if product_delete(existing):
                                pid = create_product_flow(
                                    channel_id=channel_id,
                                    warehouse_id=warehouse_id,
                                    category_id=cid,
                                    product_type_id=product_type_id,
                                    variant_attrs=variant_attrs,
                                    name=title,
                                    slug=t["slug"],
                                    sku=sku,
                                    price=t["price"],
                                    description_json=desc_en,
                                    seo=seo,
                                    translations=[
                                        ("BN_BD", t["name_bn"], desc_bn),
                                        ("AR_BH", t["name_ar"], desc_ar),
                                        ("AR_AE", t["name_ar"], desc_ar),
                                    ],
                                )
                                product_ids.append(pid)
                                print(f"  product repaired {sku} {t['slug']} type={pt_slug!r} ({pt_name})")
                                repaired = True
                    if not repaired:
                        if ATTACH_MEDIA_ON_REUSE:
                            ensure_product_demo_media(existing, sku, title)
                        apply_product_translations(
                            existing,
                            [
                                ("BN_BD", t["name_bn"], desc_bn),
                                ("AR_BH", t["name_ar"], desc_ar),
                                ("AR_AE", t["name_ar"], desc_ar),
                            ],
                        )
                        if not SKIP_STOCK_SYNC_ON_REUSE:
                            sync_product_variants_stock_to_warehouse(
                                existing,
                                warehouse_id,
                                SEED_VARIANT_STOCK_QTY,
                            )
                        print(
                            f"  product reuse {sku} {t['slug']} — slug exists, keeping product id for collections.",
                            file=sys.stderr,
                        )
                        product_ids.append(existing)
                    continue
            print(f"  product FAIL {sku}: {e}", file=sys.stderr)
            raise

    half = len(product_ids) // 2
    collection_add_products(feat_id, product_ids[:half])
    collection_add_products(best_id, product_ids[half:])
    print("Done. Refresh storefront — collections, PDP descriptions, images, and menus (if permitted).")


if __name__ == "__main__":
    main()
