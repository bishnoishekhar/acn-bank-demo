"""ACN Bank EPP gadget catalogue.

Curated per-brand catalogue. The agent filters by BOTH brand and category so
"iPhone" surfaces only Apple phones, "laptop" surfaces every brand's laptops,
"MacBook" surfaces only Apple laptops, etc. The LLM is responsible for
extracting brand + category from the customer's phrase — this tool does not
try to fuzzy-match on names.

Interest rate: flat 1.5% one-time processing fee added to the retail price and
divided across the chosen tenure.

Image URLs — approach:
  * Apple products point at Apple's own marketing CDN (www.apple.com/v/... and
    store.storeimages.cdn-apple.com/...). These hosts allow hotlinking so the
    URL is used directly.
  * Non-Apple manufacturers (Samsung, HP, Dell, Microsoft, etc.) tend to block
    third-party Referer headers, so we wrap those URLs in images.weserv.nl —
    a free image proxy that fetches the source server-side and re-serves the
    bytes with permissive headers. Format:
      https://images.weserv.nl/?url=<host+path>&w=440&h=440&fit=inside
  * For products where we could not verify a working manufacturer URL, we
    leave image_url empty. The acn-epp-carousel widget's onError handler
    then draws a category-coloured emoji card so the tile still looks
    intentional.
"""

from typing import Any, Dict, List

EPP_INTEREST_RATE_PCT = 1.5
STANDARD_TENURES_MONTHS = [6, 12, 24]

# Supported brands and categories. Kept flat + lowercase so the filter logic
# is a plain equality check — no synonyms, no partial matching.
BRANDS = {
    "apple", "samsung", "google", "sony", "microsoft", "asus", "dell",
    "lenovo", "hp", "acer", "dyson", "bose", "nintendo", "playstation",
}
CATEGORIES = {
    "smartphone", "laptop", "tablet", "audio", "wearable", "console", "home",
}


# NB: CES Agent Builder treats every top-level `def` as an importable tool,
# ignoring Python's underscore-prefix "private" convention. So we cannot
# extract a `_weserv()` helper here — the URL wrapping has to be inlined
# below. Format: https://images.weserv.nl/?url=<host+path>&w=440&h=440
# (weserv is a free public image proxy that strips the protocol from the
# source URL, so pass host+path only — no 'https://' prefix.)
_WESERV_PREFIX = "https://images.weserv.nl/?url="
_WESERV_SUFFIX = "&w=440&h=440&fit=inside&bg=white"


_CATALOG: List[Dict[str, Any]] = [
    # ── Smartphones ──────────────────────────────────────────────────────
    {
        "product_id": "iphone-18-pro-256",
        "product_name": "iPhone 18 Pro",
        "brand": "apple",
        "category": "smartphone",
        "tagline": "The one you actually want.",
        "retail_price_cad": 1749.00,
        "image_url": "https://www.apple.com/v/iphone/home/ck/images/overview/select/iphone_18_pro__dj48ysc0yagm_large.jpg",
        "merchant": "Apple Canada",
    },
    {
        "product_id": "iphone-17-256",
        "product_name": "iPhone 17",
        "brand": "apple",
        "category": "smartphone",
        "tagline": "Everything you love. Even better.",
        "retail_price_cad": 1149.00,
        "image_url": "https://www.apple.com/v/iphone/home/ck/images/overview/select/iphone_17__fb1277oq3eaa_large.jpg",
        "merchant": "Apple Canada",
    },
    {
        "product_id": "iphone-air-256",
        "product_name": "iPhone Air",
        "brand": "apple",
        "category": "smartphone",
        "tagline": "Impossibly thin.",
        "retail_price_cad": 1499.00,
        "image_url": "https://www.apple.com/v/iphone/home/ck/images/overview/select/iphone_air__b5qmgl05ojyq_large.jpg",
        "merchant": "Apple Canada",
    },
    {
        "product_id": "iphone-16-128",
        "product_name": "iPhone 16",
        "brand": "apple",
        "category": "smartphone",
        "tagline": "Still a classic.",
        "retail_price_cad": 999.00,
        "image_url": "https://www.apple.com/v/iphone/home/ck/images/overview/select/iphone_16__b6tkv86m2gc2_large.jpg",
        "merchant": "Apple Canada",
    },
    {
        "product_id": "samsung-s25-ultra",
        "product_name": "Samsung Galaxy S25 Ultra",
        "brand": "samsung",
        "category": "smartphone",
        "tagline": "The camera that does it all.",
        "retail_price_cad": 1899.00,
        "image_url": _WESERV_PREFIX + "images.samsung.com/ca/smartphones/galaxy-s25-ultra/images/galaxy-s25-ultra-features-kv.jpg" + _WESERV_SUFFIX,
        "merchant": "Samsung Canada",
    },
    {
        "product_id": "samsung-s25-plus",
        "product_name": "Samsung Galaxy S25+",
        "brand": "samsung",
        "category": "smartphone",
        "tagline": "AI-first flagship.",
        "retail_price_cad": 1449.00,
        "image_url": "",  # verified URL not available; emoji fallback used
        "merchant": "Samsung Canada",
    },
    {
        "product_id": "google-pixel-10-pro",
        "product_name": "Google Pixel 10 Pro",
        "brand": "google",
        "category": "smartphone",
        "tagline": "Made for Gemini.",
        "retail_price_cad": 1449.00,
        "image_url": "",  # verified URL not available; emoji fallback used
        "merchant": "Google Store",
    },

    # ── Laptops ──────────────────────────────────────────────────────────
    {
        "product_id": "macbook-air-m5-13",
        "product_name": "MacBook Air M5 13\"",
        "brand": "apple",
        "category": "laptop",
        "tagline": "Featherlight. Work anywhere.",
        "retail_price_cad": 1499.00,
        "image_url": "https://www.apple.com/v/macbook-air/z/images/overview/hero/hero_startframe__c0rhv2ultfau_large.png",
        "merchant": "Apple Canada",
    },
    {
        "product_id": "macbook-pro-m5-14",
        "product_name": "MacBook Pro M5 14\"",
        "brand": "apple",
        "category": "laptop",
        "tagline": "Studio-grade portable.",
        "retail_price_cad": 2299.00,
        "image_url": "https://www.apple.com/v/macbook-pro/ax/images/overview/welcome/hero_startframe__ek0dqbh61vau_xlarge.jpg",
        "merchant": "Apple Canada",
    },
    {
        "product_id": "dell-xps-13-2026",
        "product_name": "Dell XPS 13 (2026)",
        "brand": "dell",
        "category": "laptop",
        "tagline": "Zero-lattice keys, edge-to-edge.",
        "retail_price_cad": 1699.00,
        "image_url": _WESERV_PREFIX + "i.dell.com/is/image/DellContent/content/dam/ss2/product-images/dell-client-products/notebooks/xps-notebooks/xps-13-dx13260/media-gallery/sky/laptop-xps-13-sky-dx13260-silver-gallery-1.psd?fmt=png-alpha&scl=1&hei=440&wid=440" + _WESERV_SUFFIX,
        "merchant": "Dell Canada",
    },
    {
        "product_id": "hp-spectre-x360",
        "product_name": "HP Spectre x360 14",
        "brand": "hp",
        "category": "laptop",
        "tagline": "Convertible, gem-cut hinge.",
        "retail_price_cad": 1899.00,
        "image_url": _WESERV_PREFIX + "www.hp.com/content/dam/sites/worldwide/personal-computers/consumer/laptops-and-2-n-1s/spectre/HP-Spectre-x360-14-spec.jpg" + _WESERV_SUFFIX,
        "merchant": "HP Canada",
    },
    {
        "product_id": "microsoft-surface-laptop",
        "product_name": "Microsoft Surface Laptop",
        "brand": "microsoft",
        "category": "laptop",
        "tagline": "Copilot+ built-in.",
        "retail_price_cad": 1599.00,
        "image_url": _WESERV_PREFIX + "images.ctfassets.net/jy9s7k22hbg4/7F66buutksE54g8QKIVWRI/6d1980466096940ca66764399d557444/MSFT-Surface-Laptop-Hero-Mobile-Multi-Poster-New-fy26.jpg" + _WESERV_SUFFIX,
        "merchant": "Microsoft Canada",
    },
    {
        "product_id": "asus-zenbook-14",
        "product_name": "ASUS ZenBook 14 OLED",
        "brand": "asus",
        "category": "laptop",
        "tagline": "OLED that ships in a laptop.",
        "retail_price_cad": 1399.00,
        "image_url": "",  # verified URL not available; emoji fallback used
        "merchant": "ASUS Canada",
    },
    {
        "product_id": "lenovo-thinkpad-x1",
        "product_name": "Lenovo ThinkPad X1 Carbon",
        "brand": "lenovo",
        "category": "laptop",
        "tagline": "The road warrior classic.",
        "retail_price_cad": 2199.00,
        "image_url": "",  # verified URL not available; emoji fallback used
        "merchant": "Lenovo Canada",
    },
    {
        "product_id": "acer-swift-14-ai",
        "product_name": "Acer Swift 14 AI",
        "brand": "acer",
        "category": "laptop",
        "tagline": "AI PC on a budget.",
        "retail_price_cad": 1249.00,
        "image_url": "",  # verified URL not available; emoji fallback used
        "merchant": "Acer Canada",
    },

    # ── Tablets ──────────────────────────────────────────────────────────
    {
        "product_id": "ipad-pro-m5-11",
        "product_name": "iPad Pro M5 11\"",
        "brand": "apple",
        "category": "tablet",
        "tagline": "Draw. Edit. Present.",
        "retail_price_cad": 1499.00,
        "image_url": "https://www.apple.com/v/ipad-pro/aw/images/overview/hero/hero_startframe__eaxt4o8j4d2e_large.jpg",
        "merchant": "Apple Canada",
    },
    {
        "product_id": "ipad-air-m4-11",
        "product_name": "iPad Air M4 11\"",
        "brand": "apple",
        "category": "tablet",
        "tagline": "Serious power, everyday price.",
        "retail_price_cad": 949.00,
        "image_url": "https://www.apple.com/v/ipad-air/ah/images/overview/hero/hero_endframe__6gl84bccyaqi_large.png",
        "merchant": "Apple Canada",
    },
    {
        "product_id": "samsung-tab-s10-plus",
        "product_name": "Samsung Galaxy Tab S10+",
        "brand": "samsung",
        "category": "tablet",
        "tagline": "AMOLED, S Pen included.",
        "retail_price_cad": 1349.00,
        "image_url": "",  # verified URL not available; emoji fallback used
        "merchant": "Samsung Canada",
    },

    # ── Audio ────────────────────────────────────────────────────────────
    {
        "product_id": "airpods-pro-3",
        "product_name": "AirPods Pro 3",
        "brand": "apple",
        "category": "audio",
        "tagline": "Quiet, on demand.",
        "retail_price_cad": 329.00,
        "image_url": "https://www.apple.com/v/airpods-pro/t/images/overview/welcome/hero_startframe__bfinf01b59si_large.jpg",
        "merchant": "Apple Canada",
    },
    {
        "product_id": "airpods-max-2",
        "product_name": "AirPods Max 2",
        "brand": "apple",
        "category": "audio",
        "tagline": "Concert hall, on your head.",
        "retail_price_cad": 779.00,
        "image_url": "https://www.apple.com/v/airpods-max/l/images/overview/welcome/max-loop_startframe__c0vn1ukmh7ma_xlarge.jpg",
        "merchant": "Apple Canada",
    },
    {
        "product_id": "sony-wh1000xm6",
        "product_name": "Sony WH-1000XM6",
        "brand": "sony",
        "category": "audio",
        "tagline": "Studio-grade silence.",
        "retail_price_cad": 549.00,
        "image_url": "",  # sony.ca blocks hotlinking + our fetch; emoji fallback used
        "merchant": "Sony Canada",
    },
    {
        "product_id": "bose-qc-ultra",
        "product_name": "Bose QuietComfort Ultra",
        "brand": "bose",
        "category": "audio",
        "tagline": "Immersive audio.",
        "retail_price_cad": 599.00,
        "image_url": "",  # verified URL not available; emoji fallback used
        "merchant": "Bose Canada",
    },

    # ── Wearables ────────────────────────────────────────────────────────
    {
        "product_id": "apple-watch-ultra-4",
        "product_name": "Apple Watch Ultra 4",
        "brand": "apple",
        "category": "wearable",
        "tagline": "Built to go further.",
        "retail_price_cad": 1149.00,
        "image_url": "https://store.storeimages.cdn-apple.com/1/as-images.apple.com/is/watch-compare-ultra-4-202609?wid=520&hei=520&fmt=png-alpha",
        "merchant": "Apple Canada",
    },
    {
        "product_id": "apple-watch-s12",
        "product_name": "Apple Watch Series 12",
        "brand": "apple",
        "category": "wearable",
        "tagline": "Thinner. Bigger. Brighter.",
        "retail_price_cad": 549.00,
        "image_url": "https://store.storeimages.cdn-apple.com/1/as-images.apple.com/is/watch-compare-series-12-202609?wid=520&hei=520&fmt=png-alpha",
        "merchant": "Apple Canada",
    },

    # ── Consoles ─────────────────────────────────────────────────────────
    {
        "product_id": "ps5-slim",
        "product_name": "PlayStation 5 Slim",
        "brand": "playstation",
        "category": "console",
        "tagline": "Weekends, sorted.",
        "retail_price_cad": 649.99,
        "image_url": "",  # PlayStation Direct blocks our fetch; emoji fallback used
        "merchant": "PlayStation Direct",
    },
    {
        "product_id": "nintendo-switch-2",
        "product_name": "Nintendo Switch 2",
        "brand": "nintendo",
        "category": "console",
        "tagline": "Play anywhere, again.",
        "retail_price_cad": 549.99,
        "image_url": "",  # verified URL not available; emoji fallback used
        "merchant": "Nintendo Store",
    },
    {
        "product_id": "xbox-series-x",
        "product_name": "Xbox Series X",
        "brand": "microsoft",
        "category": "console",
        "tagline": "Fastest, most powerful Xbox.",
        "retail_price_cad": 649.99,
        "image_url": "",  # verified URL not available; emoji fallback used
        "merchant": "Microsoft Canada",
    },

    # ── Home ─────────────────────────────────────────────────────────────
    {
        "product_id": "dyson-v15-detect",
        "product_name": "Dyson V15 Detect",
        "brand": "dyson",
        "category": "home",
        "tagline": "Sees what you missed.",
        "retail_price_cad": 949.99,
        "image_url": "",  # dyson.ca blocks our fetch; emoji fallback used
        "merchant": "Dyson Canada",
    },
    {
        "product_id": "dyson-airwrap",
        "product_name": "Dyson Airwrap",
        "brand": "dyson",
        "category": "home",
        "tagline": "Style without extreme heat.",
        "retail_price_cad": 799.99,
        "image_url": "",  # verified URL not available; emoji fallback used
        "merchant": "Dyson Canada",
    },
]


def epp_product_catalog(category: str = "", brand: str = "") -> Dict[str, Any]:
    """Return catalogue rows, filtered by any combination of brand + category.

    Both filters are optional; passing neither returns the whole catalogue.
    An unknown brand or category returns an empty list — the agent should
    handle that by asking the customer to clarify or dropping the filter.

    Note: helpers are defined as NESTED functions instead of module-level
    `_underscore` functions. CES Agent Builder auto-registers every
    top-level `def` as an importable tool and ignores the underscore
    convention, so keeping them nested prevents them from polluting the
    tool list in the console.
    """
    def from_monthly(retail_price_cad: float) -> float:
        """Cheapest monthly figure across the standard tenures."""
        longest = max(STANDARD_TENURES_MONTHS)
        total = retail_price_cad * (1 + EPP_INTEREST_RATE_PCT / 100.0)
        return round(total / longest, 2)

    category = (category or "").strip().lower()
    brand = (brand or "").strip().lower()

    filtered = []
    for raw in _CATALOG:
        if category and raw["category"] != category:
            continue
        if brand and raw["brand"] != brand:
            continue
        product = dict(raw)
        product["from_monthly_cad"] = from_monthly(raw["retail_price_cad"])
        product["cta_label"] = "Choose plan"
        product["cta_value"] = "epp_select:{}".format(raw["product_id"])
        filtered.append(product)

    return {
        "status": "success",
        "applied_filters": {
            "brand": brand or None,
            "category": category or None,
        },
        "products": filtered,
        "interest_rate_pct": EPP_INTEREST_RATE_PCT,
        "tenures_months": STANDARD_TENURES_MONTHS,
        "available_brands": sorted({p["brand"] for p in _CATALOG}),
        "available_categories": sorted({p["category"] for p in _CATALOG}),
    }
