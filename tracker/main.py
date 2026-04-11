import argparse
import logging
import time

import schedule

from .config import load_config
from .discord import send_reports
from .price_checker import check_all_prices

logger = logging.getLogger(__name__)


def run_price_check(config):
    """Run a single price check cycle: fetch prices, send to Discord."""
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

    send_reports(config.webhook_url, reports, config.bot_name)
    logger.info("=== Price check finished ===")


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
        run_price_check(config)
        return

    # Schedule recurring runs
    for t in config.schedule_times:
        schedule.every().day.at(t).do(run_price_check, config)
        logger.info("Scheduled price check at %s %s", t, config.schedule_timezone)

    # Run immediately on startup
    logger.info("Running initial price check...")
    run_price_check(config)

    # Main loop
    logger.info("Scheduler running. Next check at: %s", schedule.next_run())
    while True:
        schedule.run_pending()
        time.sleep(60)


if __name__ == "__main__":
    main()
