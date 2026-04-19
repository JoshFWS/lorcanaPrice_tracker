# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lorcana Price Tracker monitors Disney Lorcana TCG product prices via TCGPlayer (through tcgcsv.com) and Google web search, sending Discord alerts when prices drop below user-defined targets.

## Commands

```bash
# Run a single price check (test mode)
python -m tracker --once

# Run continuous scheduled mode
python -m tracker

# Run unit tests (plain scripts, no pytest/framework configured — invoke directly)
python test_product_types.py

# Test web search functionality
python test_web_search.py

# Install dependencies
pip install -r requirements.txt
```

## Architecture

The backend lives entirely in `tracker/`. Data flows:

1. `__main__.py` → `main.py` — entry point; handles scheduling (fixed-time via `schedule` library or randomized "paranoid" mode)
2. `main.py` calls `price_checker.py` per product
3. `price_checker.py` coordinates three data sources:
   - `tcgcsv_client.py` — fetches TCGPlayer prices from tcgcsv.com (REST API, cached per `group_id`)
   - `web_search.py` → `search_web_prices()` — generic Google search with regex price extraction
   - `web_search.py` → `search_priority_retailers()` — site-scoped searches for each entry in `PRIORITY_RETAILERS` (currently `gamenerdz.com`, `doubleinfinitygaming.com`); results are **always** included in the report with status `available` / `sold_out` / `not_found` / `error`
4. Results are combined into `ProductReport` (defined in `models.py`)
5. `discord.py` formats `ProductReport` into Discord embeds and POSTs to webhook

**Alert logic** (in `models.py`/`price_checker.py`):
- `is_deal`: `lowest_price ≤ target_price` (user's "buy now" price)
- `is_alert`: `lowest_price < msrp × alert_threshold_pct` (default 80%)

**Paranoid mode** randomizes check intervals (±40% jitter) and suppresses duplicate alerts when prices haven't changed.

**Scheduling modes** (non-paranoid, in `main.py`):
- `schedule.interval_hours: N` — `schedule.every(N).hours.do(...)` (default: `3` when neither key is set)
- `schedule.times: [...]` — fixed 24h clock times via `schedule.every().day.at(t).do(...)`
- `interval_hours` takes precedence over `times` when both are set.

**Category ID:** Lorcana is TCGPlayer category `71`. This is hardcoded as `LORCANA_CATEGORY_ID` in `tcgcsv_client.py` and defaulted in `config.py` — override via `category_id` in `config.yaml` to support other TCGs.

## Key Modules

| File | Role |
|------|------|
| `tracker/models.py` | Data classes: `ProductConfig`, `AppConfig`, `TCGPlayerPrice`, `WebPrice`, `ProductReport` |
| `tracker/product_types.py` | Detects product type (booster box, trove, starter deck, etc.) from search terms; validates results match type and fall in sane price ranges |
| `tracker/tcgcsv_client.py` | Fuzzy-matches product names; handles Normal/Holofoil/Cold Foil variants; retry logic with exponential backoff |
| `tracker/web_search.py` | Multi-query strategy; deduplicates by source (keeps lowest per retailer); filters sold-out/social-media results |

## Configuration

Two files required (see `.env.example` and `config.yaml.example`):

- **`.env`** — `DISCORD_WEBHOOK_URL`
- **`config.yaml`** — schedule, products list (each with `product_id`, `group_id`, `msrp`, `target_price`, `search_terms`)

`config.py` loads and validates both; throws on missing required fields.

## Chrome Extensions

Two MV3 Chrome extensions live alongside the backend. Both use the Chrome Alarms API for scheduling, Chrome Storage API for persisted settings, and a service worker (`service-worker.js`) as the background entry point. Extensions are loaded unpacked in Chrome developer mode — no build step required.

- **`extension/`** — Lorcana price tracker. Registers `content-script.js` on `https://www.google.com/search*` to scrape prices off a Google results page opened in a hidden tab. Shared logic lives in `lib/{config,discord,product-types,tcgcsv}.js` — mirrors of the Python modules.
- **`ao3-extension/`** — AO3 work tracker. **No content scripts**; the service worker fetches AO3 pages directly on an alarm schedule. Shared logic in `lib/{ao3-parser,config,discord,scheduler}.js`, UI in `popup.{html,js,css}`.

## Repo layout gotcha

There is a nested `lorcanaPrice_tracker/` directory at the repo root that is a **stale full copy** of the project (own `.git`, `tracker/`, extensions, tests). It is not the source of truth — edits there do not affect the running code. Always work at the repo root unless you have a specific reason to touch the copy.
