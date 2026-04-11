# Lorcana Price Tracker

Automated price tracker for Disney Lorcana TCG products. Checks prices twice daily and sends the lowest prices to a Discord webhook.

## How It Works

1. **TCGPlayer prices** via [tcgcsv.com](https://tcgcsv.com) — free API mirroring TCGPlayer's full catalog. Returns market price, lowest listing, mid, and high prices.
2. **Web search** via Google — automatically searches for the lowest prices across any retailer. No retailer list to maintain.
3. **Discord notifications** — sends formatted messages with price alerts when prices drop below your targets.

## Setup

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure your Discord webhook

Copy `.env.example` to `.env` and add your Discord webhook URL:

```bash
cp .env.example .env
# Edit .env with your webhook URL
```

To create a webhook: Discord Server Settings > Integrations > Webhooks > New Webhook > Copy Webhook URL.

### 3. Configure products to track

Copy `config.yaml.example` to `config.yaml` and edit your products:

```bash
cp config.yaml.example config.yaml
# Edit config.yaml with your products
```

Each product needs:
- `name` — display name
- `search_terms` — what to search Google for (be specific about the variant)
- `group_id` — TCGPlayer set ID (find at tcgcsv.com)
- `product_id` — TCGPlayer product ID (optional, for exact matching)
- `target_price` — your deal threshold
- `msrp` — manufacturer's suggested price (for sealed products)

### 4. Run

**Single check (test mode):**
```bash
python -m tracker --once
```

**Continuous (scheduled twice daily):**
```bash
python -m tracker
```

The tool runs an immediate check on startup, then checks at your configured schedule times (default: 9 AM and 9 PM Eastern).

## Finding TCGPlayer IDs

Browse sets and products at [tcgcsv.com](https://tcgcsv.com). Lorcana is category 71.

- **Groups (sets):** `https://tcgcsv.com/tcgplayer/71/groups`
- **Products in a set:** `https://tcgcsv.com/tcgplayer/71/{groupId}/products`
- **Prices in a set:** `https://tcgcsv.com/tcgplayer/71/{groupId}/prices`

## Discord Notification Format

```
🚨 **DEAL FOUND at or below your $110.00 target! BUY NOW!** 🚨
🔥🔥🔥 **LOW PRICE ALERT — Lowest price in a while!** 🔥🔥🔥

**Winterspell Booster Box**
Checked: April 11, 2026 09:00 AM

📊 **TCGPlayer**
Market: $116.71 | Low: $109.99 | Mid: $120.00
View on TCGPlayer

🔍 **Lowest Found Online**
🔥 **$104.99** - GameNerdz
**$112.50** - Miniature Market
**$119.99** - CoolStuffInc

Target: ~$110.00 | MSRP: $143.76
```

## License

MIT
