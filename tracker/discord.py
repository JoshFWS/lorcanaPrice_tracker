import logging
import time
from datetime import datetime

import requests

from .models import ProductReport

logger = logging.getLogger(__name__)

MAX_CONTENT_LENGTH = 2000
DISCORD_RATE_LIMIT_RETRY_DELAY = 5


def send_reports(webhook_url: str, reports: list[ProductReport], bot_name: str):
    """Send price reports to Discord, one message per product."""
    for report in reports:
        message = _format_message(report)
        _send_webhook(webhook_url, message, bot_name)
        time.sleep(1)  # Brief delay between messages


def _format_message(report: ProductReport) -> str:
    """Format a ProductReport into a Discord message following the skill's spec."""
    lines = []

    # Alert headers
    if report.is_deal:
        target = report.product.target_price
        lines.append(
            f"🚨 **DEAL FOUND at or below your ${target:.2f} target! BUY NOW!** 🚨"
        )
    if report.is_alert:
        lines.append(
            "🔥🔥🔥 **LOW PRICE ALERT — Lowest price in a while!** 🔥🔥🔥"
        )

    if lines:
        lines.append("")

    # Product name and timestamp
    lines.append(f"**{report.product.name}**")
    checked = report.checked_at.strftime("%B %d, %Y %I:%M %p")
    lines.append(f"Checked: {checked}")
    lines.append("")

    # TCGPlayer section
    if report.tcgplayer:
        tcp = report.tcgplayer
        lines.append("📊 **TCGPlayer**")
        price_parts = []
        if tcp.market_price is not None:
            price_parts.append(f"Market: ${tcp.market_price:.2f}")
        if tcp.low_price is not None:
            price_parts.append(f"Low: ${tcp.low_price:.2f}")
        if tcp.mid_price is not None:
            price_parts.append(f"Mid: ${tcp.mid_price:.2f}")
        if price_parts:
            lines.append(" | ".join(price_parts))
        if tcp.product_url:
            lines.append(f"[View on TCGPlayer]({tcp.product_url})")
        lines.append("")

    # Web search results section
    if report.web_prices:
        lines.append("🔍 **Lowest Found Online**")
        for wp in report.web_prices:
            alert_prefix = ""
            if _price_triggers_alert(wp.price, report):
                alert_prefix = "🔥 "
            lines.append(f"{alert_prefix}**${wp.price:.2f}** - [{wp.source}]({wp.url})")
        lines.append("")

    # Footer: target and MSRP
    footer_parts = []
    if report.product.target_price is not None:
        footer_parts.append(f"Target: ~${report.product.target_price:.2f}")
    if report.product.msrp is not None:
        footer_parts.append(f"MSRP: ${report.product.msrp:.2f}")
    if footer_parts:
        lines.append(" | ".join(footer_parts))

    # Errors
    if report.errors:
        lines.append("")
        lines.append("⚠️ " + "; ".join(report.errors))

    message = "\n".join(lines)

    # Truncate if too long for Discord
    if len(message) > MAX_CONTENT_LENGTH:
        message = message[: MAX_CONTENT_LENGTH - 20] + "\n... (truncated)"

    return message


def _price_triggers_alert(price: float, report: ProductReport) -> bool:
    """Check if a specific price should get the 🔥 emoji."""
    if report.product.msrp is not None:
        threshold = report.product.msrp * report.product.alert_threshold_pct
        if price < threshold:
            return True
    if report.product.target_price is not None and price <= report.product.target_price:
        return True
    return False


def _send_webhook(webhook_url: str, content: str, bot_name: str):
    """Send a message to a Discord webhook with retry on rate limit."""
    payload = {
        "username": bot_name,
        "content": content,
    }

    for attempt in range(3):
        try:
            resp = requests.post(webhook_url, json=payload, timeout=10)

            if resp.status_code == 204:
                logger.info("Discord message sent successfully")
                return

            if resp.status_code == 429:
                retry_after = resp.json().get("retry_after", DISCORD_RATE_LIMIT_RETRY_DELAY)
                logger.warning("Discord rate limited, retrying after %s seconds", retry_after)
                time.sleep(retry_after)
                continue

            resp.raise_for_status()

        except requests.RequestException as e:
            logger.error("Failed to send Discord message (attempt %d): %s", attempt + 1, e)
            if attempt < 2:
                time.sleep(2)

    logger.error("All Discord send attempts failed")
