import logging
import re
import time
from datetime import datetime
from urllib.parse import urlparse

from googlesearch import search

from .models import WebPrice
from .product_types import detect_product_type, is_result_relevant, is_price_reasonable

logger = logging.getLogger(__name__)

# Delay between Google searches to avoid rate limiting
SEARCH_DELAY_SECONDS = 2.0

# Phrases that indicate an item is sold out / unavailable
SOLD_OUT_PHRASES = [
    "sold out", "out of stock", "currently unavailable", "no longer available",
    "not available", "unavailable", "backordered", "pre-order sold out",
    "notify me when available", "notify when available", "email when available",
]

# Domains to skip (not real retail prices)
SKIP_DOMAINS = {
    "reddit.com", "youtube.com", "twitter.com", "x.com", "facebook.com",
    "instagram.com", "tiktok.com", "wikipedia.org", "wiki.gg",
    "tcgcsv.com", "lorcana.com", "disneystore.com",
}

# Known retailer domain -> display name
RETAILER_NAMES = {
    "tcgplayer.com": "TCGPlayer",
    "ebay.com": "eBay",
    "amazon.com": "Amazon",
    "gamenerdz.com": "GameNerdz",
    "miniaturemarket.com": "Miniature Market",
    "coolstuffinc.com": "CoolStuffInc",
    "cardkingdom.com": "Card Kingdom",
    "trollandtoad.com": "Troll and Toad",
    "walmart.com": "Walmart",
    "target.com": "Target",
    "barnesandnoble.com": "Barnes & Noble",
    "bestbuy.com": "Best Buy",
    "zulusgames.com": "Zulu's Games",
    "flipsidegaming.com": "Flipside Gaming",
    "shop.pokemoncenter.com": "Pokemon Center",
    "toywiz.com": "ToyWiz",
    "dacardworld.com": "DA Card World",
    "safarizone.co": "Safari Zone",
    "starcitygames.com": "Star City Games",
}


def search_web_prices(
    search_terms: str,
    msrp: float | None = None,
    target_price: float | None = None,
    max_results: int = 3,
    product_name: str = "",
) -> list[WebPrice]:
    """
    Search the web for lowest prices using Google search.

    Follows the price-tracker skill's search patterns:
      Pattern A: general price search
      Pattern C: price-extraction with dollar amounts

    Returns up to max_results lowest unique prices found.
    """
    product_type = detect_product_type(search_terms, product_name)
    logger.info("Detected product type: %s", product_type)

    all_prices: list[WebPrice] = []

    year = datetime.now().year
    queries = _build_queries(search_terms, year, msrp, target_price)

    for query in queries:
        try:
            logger.info("Searching: %s", query)
            results = search(query, num_results=8, advanced=True)
            for result in results:
                extracted = _extract_prices_from_result(
                    result, search_terms, product_type, msrp,
                )
                all_prices.extend(extracted)
        except Exception as e:
            logger.warning("Search failed for '%s': %s", query, e)

        time.sleep(SEARCH_DELAY_SECONDS)

    # Deduplicate by (source, price), keep lowest per source
    unique = _deduplicate(all_prices)

    # Filter out unreasonable prices
    unique = _filter_prices(unique, msrp, product_type)

    # Sort by price, return top N
    unique.sort(key=lambda wp: wp.price)
    return unique[:max_results]


def _build_queries(
    search_terms: str,
    year: int,
    msrp: float | None,
    target_price: float | None,
) -> list[str]:
    """Build search queries following the skill's patterns."""
    queries = []

    # Pattern A: general price search
    queries.append(f'"{search_terms}" price {year}')

    # Pattern C: price-extraction with dollar amounts
    if msrp is not None or target_price is not None:
        base_price = target_price or (msrp * 0.80 if msrp else None)
        if base_price is not None and base_price >= 10.0:
            # Search around the target price in bands (only for higher-value items)
            prices = [
                f"${base_price - 10:.2f}",
                f"${base_price:.2f}",
                f"${base_price + 10:.2f}",
            ]
            price_or = " OR ".join(f'"{p}"' for p in prices)
            queries.append(f'"{search_terms}" {price_or}')

    # Pattern A variant: deal/discount search
    queries.append(f'"{search_terms}" cheapest buy deal')

    return queries


def _extract_prices_from_result(
    result,
    search_terms: str,
    product_type: str = "unknown",
    msrp: float | None = None,
) -> list[WebPrice]:
    """Extract price(s) from a single Google search result."""
    url = result.url if hasattr(result, "url") else str(result)
    title = result.title if hasattr(result, "title") else ""
    description = result.description if hasattr(result, "description") else ""

    domain = _get_domain(url)
    if domain in SKIP_DOMAINS:
        return []

    # Check if this result is about the right product type
    if not is_result_relevant(title, description, url, product_type, search_terms):
        return []

    # Combine title and description to search for prices
    text = f"{title} {description}"

    # Skip sold-out / out-of-stock items
    text_lower = text.lower()
    for phrase in SOLD_OUT_PHRASES:
        if phrase in text_lower:
            logger.debug("Skipping sold-out result: %s", title[:80])
            return []

    # Find all dollar amounts
    price_pattern = r'\$(\d{1,4}(?:\.\d{2})?)'
    matches = re.findall(price_pattern, text)

    if not matches:
        return []

    source = RETAILER_NAMES.get(domain, _domain_to_name(domain))
    prices = []
    seen_amounts = set()

    for match in matches:
        try:
            amount = float(match)
        except ValueError:
            continue

        if amount in seen_amounts:
            continue
        seen_amounts.add(amount)

        # Check if this price is reasonable for the product type
        if not is_price_reasonable(amount, msrp, product_type):
            logger.debug(
                "Skipping unreasonable price $%.2f for %s from %s",
                amount, product_type, source,
            )
            continue

        prices.append(WebPrice(
            price=amount,
            source=source,
            url=url,
            snippet=description[:200] if description else title[:200],
        ))

    return prices


def _get_domain(url: str) -> str:
    """Extract the base domain from a URL."""
    try:
        parsed = urlparse(url)
        host = parsed.hostname or ""
        # Strip www.
        if host.startswith("www."):
            host = host[4:]
        return host
    except Exception:
        return ""


def _domain_to_name(domain: str) -> str:
    """Convert a domain to a display name."""
    # Remove TLD
    name = domain.rsplit(".", 1)[0] if "." in domain else domain
    # Capitalize
    return name.replace("-", " ").replace("_", " ").title()


def _deduplicate(prices: list[WebPrice]) -> list[WebPrice]:
    """Keep only the lowest price per source."""
    by_source: dict[str, WebPrice] = {}
    for wp in prices:
        key = wp.source.lower()
        if key not in by_source or wp.price < by_source[key].price:
            by_source[key] = wp
    return list(by_source.values())


def _filter_prices(
    prices: list[WebPrice],
    msrp: float | None,
    product_type: str = "unknown",
) -> list[WebPrice]:
    """Filter out prices that are clearly wrong for this product type."""
    filtered = []
    for wp in prices:
        if not is_price_reasonable(wp.price, msrp, product_type):
            logger.debug(
                "Filtering out $%.2f from %s (unreasonable for %s)",
                wp.price, wp.source, product_type,
            )
            continue
        filtered.append(wp)
    return filtered
