import logging
from datetime import datetime

from .models import AppConfig, ProductConfig, ProductReport
from .tcgcsv_client import TcgCsvClient
from .web_search import search_priority_retailers, search_web_prices

logger = logging.getLogger(__name__)


def check_all_prices(config: AppConfig) -> list[ProductReport]:
    """
    Check prices for all configured products.

    For each product:
      1. Fetch TCGPlayer data via tcgcsv.com (if group_id is set)
      2. Search the web for lowest prices (if search_terms is set)
      3. Combine into a ProductReport
    """
    client = TcgCsvClient(category_id=config.category_id)
    reports = []

    for product in config.products:
        logger.info("Checking prices for: %s", product.name)
        try:
            report = _check_single_product(client, product)
            reports.append(report)
        except Exception as e:
            logger.exception("Error checking %s", product.name)
            reports.append(ProductReport(
                product=product,
                checked_at=datetime.now(),
                errors=[f"Unexpected error: {e}"],
            ))

    return reports


def _check_single_product(
    client: TcgCsvClient,
    product: ProductConfig,
) -> ProductReport:
    """Check prices for a single product from all sources."""
    errors = []
    tcgplayer_price = None
    web_prices = []
    priority_results = []

    # Source 1: TCGPlayer via tcgcsv.com
    if product.group_id is not None:
        try:
            tcgplayer_price = client.get_price(
                group_id=product.group_id,
                product_id=product.product_id,
                product_name=product.name,
                variant=product.variant,
            )
            if tcgplayer_price:
                logger.info(
                    "  TCGPlayer: market=$%s, low=$%s",
                    tcgplayer_price.market_price,
                    tcgplayer_price.low_price,
                )
            else:
                errors.append("Product not found on TCGPlayer")
        except Exception as e:
            logger.error("  TCGPlayer lookup failed: %s", e)
            errors.append(f"TCGPlayer error: {e}")

    # Source 2: Web search
    if product.search_terms:
        try:
            web_prices = search_web_prices(
                search_terms=product.search_terms,
                msrp=product.msrp,
                target_price=product.target_price,
                max_results=3,
                product_name=product.name,
            )
            for wp in web_prices:
                logger.info("  Web: $%.2f at %s", wp.price, wp.source)
        except Exception as e:
            logger.error("  Web search failed: %s", e)
            errors.append(f"Web search error: {e}")

    # Source 3: Priority retailers (always reported, even when absent/sold-out)
    if product.search_terms:
        try:
            priority_results = search_priority_retailers(
                search_terms=product.search_terms,
                msrp=product.msrp,
                product_name=product.name,
            )
            for pr in priority_results:
                if pr.status == "available":
                    logger.info("  Priority %s: $%.2f", pr.retailer, pr.price)
                else:
                    logger.info("  Priority %s: %s", pr.retailer, pr.status)
        except Exception as e:
            logger.error("  Priority retailer search failed: %s", e)
            errors.append(f"Priority search error: {e}")

    return ProductReport(
        product=product,
        tcgplayer=tcgplayer_price,
        web_prices=web_prices,
        priority_results=priority_results,
        checked_at=datetime.now(),
        errors=errors,
    )
