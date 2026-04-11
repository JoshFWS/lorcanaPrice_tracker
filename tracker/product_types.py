"""Product type detection and filtering for Lorcana price searches.

Ensures that web search results match the actual product being searched for
(e.g. a booster box search doesn't return single card prices).
"""

import logging

logger = logging.getLogger(__name__)

# Product type definitions: keywords to identify them, negative keywords that
# signal a result is about a *different* product, and price floor constraints.
PRODUCT_TYPES = {
    "booster_box": {
        "keywords": ["booster box", "booster display", "display 24", "24 pack"],
        "negative_keywords": ["single card", "individual card", "singles", "booster pack single"],
        "msrp_floor_ratio": 0.30,
        "hard_floor": 40.0,
    },
    "trove": {
        "keywords": ["trove", "illumineer"],
        "negative_keywords": ["booster box", "booster display", "display 24", "single card", "singles"],
        "msrp_floor_ratio": 0.30,
        "hard_floor": 15.0,
    },
    "booster_pack": {
        "keywords": ["booster pack", "single pack"],
        "negative_keywords": ["booster box", "booster display", "display 24"],
        "msrp_floor_ratio": 0.30,
        "hard_floor": 3.0,
    },
    "starter_deck": {
        "keywords": ["starter deck"],
        "negative_keywords": ["booster box", "single card", "singles"],
        "msrp_floor_ratio": 0.30,
        "hard_floor": 8.0,
    },
    "gift_set": {
        "keywords": ["gift set", "bundle"],
        "negative_keywords": ["booster box", "single card", "singles"],
        "msrp_floor_ratio": 0.30,
        "hard_floor": 15.0,
    },
    "single_card": {
        "keywords": ["card"],
        "negative_keywords": ["booster box", "sealed", "booster display", "display 24", "trove"],
        "msrp_floor_ratio": 0.10,
        "hard_floor": 0.25,
    },
    "unknown": {
        "keywords": [],
        "negative_keywords": [],
        "msrp_floor_ratio": 0.10,
        "hard_floor": 1.0,
    },
}

# Order types so longer/more-specific keywords match first.
_DETECTION_ORDER = [
    "booster_box",
    "trove",
    "booster_pack",
    "starter_deck",
    "gift_set",
    "single_card",
]


def detect_product_type(search_terms: str, name: str) -> str:
    """Determine the product type from search terms and product name.

    Scans the combined text for identifying keywords, checking
    more-specific types first (e.g. "booster box" before "card").
    """
    combined = f"{search_terms} {name}".lower()

    for type_key in _DETECTION_ORDER:
        type_def = PRODUCT_TYPES[type_key]
        for keyword in type_def["keywords"]:
            if keyword in combined:
                logger.debug("Detected product type '%s' from keyword '%s'", type_key, keyword)
                return type_key

    return "unknown"


def is_result_relevant(
    title: str,
    snippet: str,
    url: str,
    product_type: str,
    search_terms: str,
) -> bool:
    """Check whether a search result is about the correct product type.

    Returns False if the result text contains negative keywords for the
    detected product type, or if it lacks any identifying keywords
    (with an exception for direct product-page URLs).
    """
    type_def = PRODUCT_TYPES.get(product_type, PRODUCT_TYPES["unknown"])
    combined = f"{title} {snippet}".lower()

    # Check for negative keywords — strong signal of wrong product type
    for neg_kw in type_def["negative_keywords"]:
        if neg_kw in combined:
            # Don't reject if a positive keyword also appears (mixed listing)
            has_positive = any(kw in combined for kw in type_def["keywords"])
            if not has_positive:
                logger.debug(
                    "Rejecting result (negative keyword '%s'): %s",
                    neg_kw, title[:80],
                )
                return False

    # For known product types, require at least one identifying keyword
    # in the result — unless it's a direct product-page URL
    if product_type != "unknown" and type_def["keywords"]:
        has_type_keyword = any(kw in combined for kw in type_def["keywords"])
        is_product_page = any(
            seg in url.lower()
            for seg in ("/product/", "/item/", "/dp/", "/ip/", "/products/")
        )
        # Also accept if the search terms themselves appear substantially
        search_words = set(search_terms.lower().split())
        result_words = set(combined.split())
        word_overlap = len(search_words & result_words)
        has_good_overlap = word_overlap >= min(3, len(search_words))

        if not has_type_keyword and not is_product_page and not has_good_overlap:
            logger.debug(
                "Rejecting result (no type keyword '%s'): %s",
                product_type, title[:80],
            )
            return False

    return True


def is_price_reasonable(
    price: float,
    msrp: float | None,
    product_type: str,
) -> bool:
    """Check whether a price is within the expected range for a product type.

    Applies both absolute hard-floor and MSRP-relative floor/ceiling.
    """
    type_def = PRODUCT_TYPES.get(product_type, PRODUCT_TYPES["unknown"])

    # Hard floor — absolute minimum for this product type
    if price < type_def["hard_floor"]:
        return False

    # MSRP-relative checks
    if msrp is not None:
        if price < msrp * type_def["msrp_floor_ratio"]:
            return False
        if price > msrp * 2.0:
            return False

    return True
