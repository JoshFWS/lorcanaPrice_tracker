from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class ProductConfig:
    """A product to track, as defined in config.yaml."""
    name: str
    search_terms: str = ""
    product_id: int | None = None
    group_id: int | None = None
    variant: str = "Normal"
    msrp: float | None = None
    target_price: float | None = None
    alert_threshold_pct: float = 0.80


@dataclass
class AppConfig:
    """Top-level application configuration."""
    webhook_url: str
    bot_name: str
    category_id: int
    schedule_times: list[str]
    schedule_timezone: str
    products: list[ProductConfig]


@dataclass
class TCGPlayerPrice:
    """Price data from tcgcsv.com for a single product+variant."""
    product_name: str
    low_price: float | None = None
    market_price: float | None = None
    mid_price: float | None = None
    high_price: float | None = None
    product_url: str | None = None
    image_url: str | None = None
    sub_type: str = "Normal"


@dataclass
class WebPrice:
    """A price discovered via web search."""
    price: float
    source: str       # retailer name (extracted from URL domain)
    url: str
    snippet: str = ""  # search result snippet for context


@dataclass
class ProductReport:
    """Combined price report for a single tracked product."""
    product: ProductConfig
    tcgplayer: TCGPlayerPrice | None = None
    web_prices: list[WebPrice] = field(default_factory=list)
    checked_at: datetime = field(default_factory=datetime.now)
    errors: list[str] = field(default_factory=list)

    @property
    def lowest_price(self) -> float | None:
        """Return the absolute lowest price found across all sources."""
        prices = []
        if self.tcgplayer and self.tcgplayer.low_price is not None:
            prices.append(self.tcgplayer.low_price)
        for wp in self.web_prices:
            prices.append(wp.price)
        return min(prices) if prices else None

    @property
    def is_alert(self) -> bool:
        """True if any price is below the alert threshold (default 80% of MSRP)."""
        lowest = self.lowest_price
        if lowest is None or self.product.msrp is None:
            return False
        threshold = self.product.msrp * self.product.alert_threshold_pct
        return lowest < threshold

    @property
    def is_deal(self) -> bool:
        """True if any price is at or below the target price."""
        lowest = self.lowest_price
        if lowest is None or self.product.target_price is None:
            return False
        return lowest <= self.product.target_price
