import argparse
import logging
import random
import time

import schedule

from .config import load_config
from .discord import send_reports
from .price_checker import check_all_prices

logger = logging.getLogger(__name__)

# Stores the last known lowest price per product name for change detection.
_last_prices: dict[str, float | None] = {}


def _build_price_snapshot(reports) -> dict[str, float | None]:
    """Build a {product_name: lowest_price} dict from a list of reports."""
    return {r.product.name: r.lowest_price for r in reports}


def _has_prices_changed(new_snapshot: dict[str, float | None]) -> bool:
    """Return True if any product's lowest price differs from the last check."""
    if not _last_prices:
        return True  # First run — always report
    for name, price in new_snapshot.items():
        old = _last_prices.get(name)
        if old != price:
            return True
    # Also check if products were removed
    for name in _last_prices:
        if name not in new_snapshot:
            return True
    return False


def run_price_check(config, *, force_send: bool = False):
    """Run a single price check cycle: fetch prices, send to Discord."""
    global _last_prices

    logger.info("=== Starting price check ===")
    reports = check_all_prices(config)

    successes = sum(1 for r in reports if not r.errors)
    logger.info("Price check complete: %d/%d products succeeded", successes, len(reports))

    # Log a summary
    for report in reports:
        lowest = report.lowest_price
        price_str = f"${lowest:.2f}" if lowest is not None else "N/A"
        alert = " 🔥 ALERT" if report.is_alert else ""
        deal = " 🚨 DEAL" if report.is_deal else ""
        logger.info("  %s — lowest: %s%s%s", report.product.name, price_str, alert, deal)

    snapshot = _build_price_snapshot(reports)

    if force_send or not config.paranoid_mode or _has_prices_changed(snapshot):
        send_reports(config.webhook_url, reports, config.bot_name)
        logger.info("Discord update sent")
    else:
        logger.info("Prices unchanged — skipping Discord update (paranoid mode)")

    _last_prices = snapshot
    logger.info("=== Price check finished ===")


def _run_paranoid_loop(config):
    """Run checks at random intervals within each hour (paranoid mode)."""
    checks = max(1, min(config.checks_per_hour, 12))
    interval_seconds = 3600 // checks

    logger.info(
        "Paranoid mode: %d check(s)/hour, randomizing times to avoid detection",
        checks,
    )

    # Run immediately on startup
    logger.info("Running initial price check...")
    run_price_check(config, force_send=True)

    while True:
        # Random jitter: ±40% of the interval, so times are unpredictable
        jitter = int(interval_seconds * 0.4)
        wait = interval_seconds + random.randint(-jitter, jitter)
        wait = max(60, wait)  # Never less than 1 minute

        next_check = time.strftime("%H:%M:%S", time.localtime(time.time() + wait))
        logger.info("Next check in %d seconds (at ~%s)", wait, next_check)
        time.sleep(wait)

        run_price_check(config)


def main():
    parser = argparse.ArgumentParser(description="Lorcana Price Tracker")
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run a single price check and exit (no scheduler)",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    config = load_config()
    logger.info("Loaded %d products to track", len(config.products))

    if args.once:
        run_price_check(config, force_send=True)
        return

    if config.paranoid_mode:
        _run_paranoid_loop(config)
    else:
        if config.schedule_interval_hours:
            schedule.every(config.schedule_interval_hours).hours.do(
                run_price_check, config
            )
            logger.info(
                "Scheduled price check every %d hour(s)",
                config.schedule_interval_hours,
            )
        else:
            for t in config.schedule_times:
                schedule.every().day.at(t).do(run_price_check, config)
                logger.info("Scheduled price check at %s %s", t, config.schedule_timezone)

        # Run immediately on startup
        logger.info("Running initial price check...")
        run_price_check(config, force_send=True)

        # Main loop
        logger.info("Scheduler running. Next check at: %s", schedule.next_run())
        while True:
            schedule.run_pending()
            time.sleep(60)


if __name__ == "__main__":
    main()
