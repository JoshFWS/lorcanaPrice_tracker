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

# Run unit tests
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
3. `price_checker.py` coordinates two data sources:
   - `tcgcsv_client.py` — fetches TCGPlayer prices from tcgcsv.com (REST API, cached per `group_id`)
   - `web_search.py` — Google search with regex price extraction from snippets
4. Results are combined into `ProductReport` (defined in `models.py`)
5. `discord.py` formats `ProductReport` into Discord embeds and POSTs to webhook

**Alert logic** (in `models.py`/`price_checker.py`):
- `is_deal`: `lowest_price ≤ target_price` (user's "buy now" price)
- `is_alert`: `lowest_price < msrp × alert_threshold_pct` (default 80%)

**Paranoid mode** randomizes check intervals (±40% jitter) and suppresses duplicate alerts when prices haven't changed.

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

Two MV3 Chrome extensions live alongside the backend:

- **`extension/`** — Lorcana price tracker popup that runs Google searches and reads prices; uses Chrome Alarms API for scheduling and Chrome Storage API for persisting settings
- **`ao3-extension/`** — AO3 fanfiction work tracker with Discord webhook notifications; content scripts (`ao3-work.js`, `ao3-search.js`) watch AO3 pages

Extensions are loaded unpacked in Chrome developer mode — no build step required.
