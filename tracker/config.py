import os
import sys
import logging

import yaml
from dotenv import load_dotenv

from .models import AppConfig, ProductConfig

logger = logging.getLogger(__name__)

CONFIG_SEARCH_PATHS = [
    "config.yaml",
    os.path.expanduser("~/.lorcana-tracker/config.yaml"),
]


def load_config() -> AppConfig:
    """Load and validate configuration from .env and config.yaml."""
    load_dotenv()

    webhook_url = os.getenv("DISCORD_WEBHOOK_URL", "")
    if not webhook_url:
        logger.error("DISCORD_WEBHOOK_URL not set in .env file")
        sys.exit(1)

    yaml_path = _find_config_file()
    if yaml_path is None:
        logger.error(
            "No config.yaml found. Searched: %s\n"
            "Copy config.yaml.example to config.yaml and edit it.",
            ", ".join(CONFIG_SEARCH_PATHS),
        )
        sys.exit(1)

    logger.info("Loading config from %s", yaml_path)
    with open(yaml_path) as f:
        raw = yaml.safe_load(f)

    if not raw:
        logger.error("config.yaml is empty")
        sys.exit(1)

    schedule = raw.get("schedule", {})
    products_raw = raw.get("products", [])
    if not products_raw:
        logger.error("No products configured in config.yaml")
        sys.exit(1)

    products = []
    for p in products_raw:
        products.append(ProductConfig(
            name=p["name"],
            search_terms=p.get("search_terms", ""),
            product_id=p.get("product_id"),
            group_id=p.get("group_id"),
            variant=p.get("variant", "Normal"),
            msrp=p.get("msrp"),
            target_price=p.get("target_price"),
            alert_threshold_pct=p.get("alert_threshold_pct", 0.80),
        ))

    paranoid = raw.get("paranoid_mode", {})

    return AppConfig(
        webhook_url=webhook_url,
        bot_name=raw.get("bot_name", "Lorcana Price Tracker"),
        category_id=raw.get("category_id", 71),
        schedule_times=schedule.get("times", ["09:00", "21:00"]),
        schedule_timezone=schedule.get("timezone", "US/Eastern"),
        products=products,
        paranoid_mode=paranoid.get("enabled", False),
        checks_per_hour=paranoid.get("checks_per_hour", 1),
    )


def _find_config_file() -> str | None:
    for path in CONFIG_SEARCH_PATHS:
        if os.path.isfile(path):
            return path
    return None
