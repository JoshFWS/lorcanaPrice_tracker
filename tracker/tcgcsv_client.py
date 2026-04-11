import logging
from urllib.parse import urljoin

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from .models import TCGPlayerPrice

logger = logging.getLogger(__name__)

BASE_URL = "https://tcgcsv.com/"
LORCANA_CATEGORY_ID = 71


class TcgCsvClient:
    """Client for the tcgcsv.com API (free TCGPlayer data mirror)."""

    def __init__(self, category_id: int = LORCANA_CATEGORY_ID):
        self.category_id = category_id
        self.session = requests.Session()
        retry = Retry(total=3, backoff_factor=2, status_forcelist=[500, 502, 503, 504])
        self.session.mount("https://", HTTPAdapter(max_retries=retry))
        self.session.headers.update({"Accept": "application/json"})
        # Cache: group_id -> (products_list, prices_list)
        self._cache: dict[int, tuple[list[dict], list[dict]]] = {}

    def get_groups(self) -> list[dict]:
        """Fetch all sets/groups for the category."""
        url = urljoin(BASE_URL, f"tcgplayer/{self.category_id}/groups")
        resp = self.session.get(url, timeout=15)
        resp.raise_for_status()
        return resp.json()["results"]

    def _fetch_group_data(self, group_id: int) -> tuple[list[dict], list[dict]]:
        """Fetch and cache products + prices for a group."""
        if group_id in self._cache:
            return self._cache[group_id]

        base = f"tcgplayer/{self.category_id}/{group_id}"
        products_url = urljoin(BASE_URL, f"{base}/products")
        prices_url = urljoin(BASE_URL, f"{base}/prices")

        logger.info("Fetching products and prices for group %d", group_id)

        products_resp = self.session.get(products_url, timeout=15)
        products_resp.raise_for_status()
        products = products_resp.json()["results"]

        prices_resp = self.session.get(prices_url, timeout=15)
        prices_resp.raise_for_status()
        prices = prices_resp.json()["results"]

        self._cache[group_id] = (products, prices)
        return products, prices

    def get_price(
        self,
        group_id: int,
        product_id: int | None = None,
        product_name: str | None = None,
        variant: str = "Normal",
    ) -> TCGPlayerPrice | None:
        """
        Get price for a specific product in a group.

        Match by product_id (exact) or product_name (fuzzy).
        Filters prices by variant (Normal/Holofoil/Cold Foil).
        """
        try:
            products, prices = self._fetch_group_data(group_id)
        except requests.RequestException as e:
            logger.error("Failed to fetch data for group %d: %s", group_id, e)
            return None

        # Find the product
        product = None
        if product_id is not None:
            for p in products:
                if p["productId"] == product_id:
                    product = p
                    break
        elif product_name:
            product = self._fuzzy_match(products, product_name)

        if product is None:
            identifier = product_id or product_name
            logger.warning("Product not found: %s in group %d", identifier, group_id)
            return None

        pid = product["productId"]

        # Find matching price entry by variant
        price_entry = None
        for pr in prices:
            if pr["productId"] == pid and pr.get("subTypeName", "Normal") == variant:
                price_entry = pr
                break

        # Fallback: if exact variant not found, try any price for this product
        if price_entry is None:
            for pr in prices:
                if pr["productId"] == pid:
                    price_entry = pr
                    variant = pr.get("subTypeName", "Normal")
                    logger.info(
                        "Variant '%s' not found for %s, using '%s'",
                        variant, product["name"], pr.get("subTypeName"),
                    )
                    break

        if price_entry is None:
            logger.warning("No price data for product %d (%s)", pid, product["name"])
            return None

        return TCGPlayerPrice(
            product_name=product["name"],
            low_price=price_entry.get("lowPrice"),
            market_price=price_entry.get("marketPrice"),
            mid_price=price_entry.get("midPrice"),
            high_price=price_entry.get("highPrice"),
            product_url=product.get("url"),
            image_url=product.get("imageUrl"),
            sub_type=price_entry.get("subTypeName", "Normal"),
        )

    def _fuzzy_match(self, products: list[dict], name: str) -> dict | None:
        """Find the best product match by name (case-insensitive substring)."""
        name_lower = name.lower()

        # Try exact match first
        for p in products:
            if p["cleanName"].lower() == name_lower or p["name"].lower() == name_lower:
                return p

        # Try substring match
        matches = []
        for p in products:
            pname = p["cleanName"].lower()
            if name_lower in pname or pname in name_lower:
                matches.append(p)

        if len(matches) == 1:
            return matches[0]

        # Try word overlap scoring
        if not matches:
            matches = products
        name_words = set(name_lower.split())
        best = None
        best_score = 0
        for p in matches:
            pwords = set(p["cleanName"].lower().split())
            score = len(name_words & pwords)
            if score > best_score:
                best_score = score
                best = p

        if best and best_score >= 2:
            logger.info("Fuzzy matched '%s' -> '%s'", name, best["name"])
            return best

        return None

    def clear_cache(self):
        """Clear cached API responses."""
        self._cache.clear()
