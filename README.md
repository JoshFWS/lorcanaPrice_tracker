# Lorcana Price Tracker

Automated price tracker for Disney Lorcana TCG products. Checks prices twice daily and sends the lowest prices to a Discord webhook. This repo also includes companion Chrome extensions (e.g. the AO3 Work Tracker) that run directly in your browser.

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

---

## Chrome Extension Installation (AO3 Work Tracker)

The extensions in this repo are **Chrome-only** and are loaded as unpacked extensions — they are not published to the Chrome Web Store. The steps below use the **AO3 Work Tracker** (`ao3-extension/`) as the example, but the same process applies to any extension folder in this repo.

> **Supported browsers:** Google Chrome (desktop). Chrome for Windows and Chrome for macOS both follow the same steps.

### Step 1 — Download or clone the repo

If you haven't already, get the files onto your machine:

```bash
git clone https://github.com/Josh_FWS/lorcanaPrice_tracker.git
```

Or download the ZIP from GitHub and unzip it anywhere convenient (e.g. your Desktop or Documents folder). Note the folder path — you'll need it in Step 3.

### Step 2 — Open the Chrome Extensions page

In Chrome, navigate to:

```
chrome://extensions
```

Or use the menu: **Chrome menu (three dots) > Extensions > Manage Extensions**.

Enable **Developer mode** using the toggle in the **top-right corner** of the Extensions page.

### Step 3 — Load the extension

1. Click **"Load unpacked"** (top-left of the Extensions page).
2. In the file picker that opens, navigate to the repo folder and select the extension's subdirectory:
   - For the AO3 Work Tracker: select the `ao3-extension/` folder.
3. Click **Select** (Mac) or **Select Folder** (Windows).

Chrome will load the extension immediately and it will appear in your extensions list.

### Step 4 — Confirm you have the right extension selected

After loading, verify you installed the correct one:

- The extension card on `chrome://extensions` will show the **name** from the manifest. For the AO3 Work Tracker it reads **"AO3 Work Tracker"**.
- The description reads: *"Track AO3 works and searches with Discord webhook notifications"*.
- The extension **ID** is a unique string shown beneath the name — keep note of it if you have multiple extensions loaded from this repo.

To make the extension easy to reach, pin it to your toolbar:

1. Click the **puzzle-piece icon** in the Chrome toolbar.
2. Find **"AO3 Work Tracker"** in the dropdown list.
3. Click the **pin icon** next to it.

The AO3 Work Tracker icon will now appear in your toolbar. Clicking it opens the popup where you configure your Discord webhook and tracking preferences.

### Platform-specific notes

| | Mac | Windows |
|---|---|---|
| Repo location (suggested) | `~/Documents/lorcanaPrice_tracker` | `C:\Users\YourName\Documents\lorcanaPrice_tracker` |
| File picker button | **Select** | **Select Folder** |
| Chrome shortcut to extensions | `Cmd+Shift+E` (via menu) | `Ctrl+Shift+E` (via menu) |

Everything else — Developer mode toggle, Load unpacked, pinning — is identical on both platforms.

### Step 5 — Set up a Discord webhook

The extension sends notifications to a Discord channel via a webhook URL. You need to create one before the extension can send you alerts.

**Create the webhook:**

1. Open Discord and go to the server where you want notifications posted.
2. Right-click the channel you want to use and select **Edit Channel**.
3. In the left sidebar, click **Integrations**.
4. Click **Webhooks > New Webhook**.
5. Give it a name (e.g. "AO3 Tracker") — this is the display name that will appear on messages.
6. Click **Copy Webhook URL**. Keep this URL private; anyone with it can post to your channel.
7. Click **Save**.

**Add the webhook URL to the extension:**

1. Click the **AO3 Work Tracker** icon in your Chrome toolbar.
2. Paste the webhook URL into the **Discord Webhook URL** field in the popup.
3. Save your settings.

The extension will now send notifications to that channel whenever it detects updates matching your tracked works or searches.

> **Tip:** If you ever need to revoke access, go back to **Integrations > Webhooks**, select the webhook, and click **Delete Webhook**. The extension will stop working until you provide a new URL.

### Keeping the extension up to date

Chrome does not auto-update unpacked extensions. When you pull new changes from the repo:

1. Go to `chrome://extensions`.
2. Find **"AO3 Work Tracker"** and click the **refresh icon** on its card.

---

## License

MIT
