export async function sendReports(webhookUrl, reports, botName) {
  for (const report of reports) {
    const message = formatMessage(report);
    await sendWebhook(webhookUrl, message, botName);
    // Brief delay between messages
    await new Promise((r) => setTimeout(r, 1000));
  }
}

export function formatMessage(report) {
  const lines = [];

  // Alert headers
  if (report.isDeal) {
    const target = report.product.targetPrice.toFixed(2);
    lines.push(`🚨 **DEAL FOUND at or below your $${target} target! BUY NOW!** 🚨`);
  }
  if (report.isAlert) {
    lines.push("🔥🔥🔥 **LOW PRICE ALERT — Lowest price in a while!** 🔥🔥🔥");
  }
  if (lines.length > 0) lines.push("");

  // Product name and timestamp
  lines.push(`**${report.product.name}**`);
  const now = new Date(report.checkedAt);
  const checked = now.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  lines.push(`Checked: ${checked}`);
  lines.push("");

  // TCGPlayer section
  if (report.tcgplayer) {
    const tcp = report.tcgplayer;
    lines.push("📊 **TCGPlayer**");
    const parts = [];
    if (tcp.marketPrice != null) parts.push(`Market: $${tcp.marketPrice.toFixed(2)}`);
    if (tcp.lowPrice != null) parts.push(`Low: $${tcp.lowPrice.toFixed(2)}`);
    if (tcp.midPrice != null) parts.push(`Mid: $${tcp.midPrice.toFixed(2)}`);
    if (parts.length > 0) lines.push(parts.join(" | "));
    if (tcp.productUrl) lines.push(`[View on TCGPlayer](${tcp.productUrl})`);
    lines.push("");
  }

  // Web search results
  if (report.webPrices && report.webPrices.length > 0) {
    lines.push("🔍 **Lowest Found Online**");
    for (const wp of report.webPrices) {
      const alertPrefix = priceTriggers(wp.price, report) ? "🔥 " : "";
      lines.push(`${alertPrefix}**$${wp.price.toFixed(2)}** - [${wp.source}](${wp.url})`);
    }
    lines.push("");
  }

  // Priority retailers — always shown, one line per retailer with status
  if (report.priorityResults && report.priorityResults.length > 0) {
    lines.push("📌 **Priority Retailers**");
    for (const pr of report.priorityResults) {
      if (pr.status === "available" && pr.price != null) {
        const alertPrefix = priceTriggers(pr.price, report) ? "🔥 " : "";
        const link = pr.url ? `[${pr.retailer}](${pr.url})` : pr.retailer;
        lines.push(`${alertPrefix}${link}: **$${pr.price.toFixed(2)}**`);
      } else if (pr.status === "sold_out") {
        lines.push(`${pr.retailer}: Sold out`);
      } else if (pr.status === "error") {
        lines.push(`${pr.retailer}: ⚠️ ${pr.message || "search error"}`);
      } else {
        lines.push(`${pr.retailer}: Not listed`);
      }
    }
    lines.push("");
  }

  // Footer
  const footer = [];
  if (report.product.targetPrice != null) {
    footer.push(`Target: ~$${report.product.targetPrice.toFixed(2)}`);
  }
  if (report.product.msrp != null) {
    footer.push(`MSRP: $${report.product.msrp.toFixed(2)}`);
  }
  if (footer.length > 0) lines.push(footer.join(" | "));

  // Errors
  if (report.errors && report.errors.length > 0) {
    lines.push("");
    lines.push("⚠️ " + report.errors.join("; "));
  }

  let message = lines.join("\n");
  if (message.length > 2000) {
    message = message.slice(0, 1980) + "\n... (truncated)";
  }
  return message;
}

function priceTriggers(price, report) {
  if (report.product.msrp != null) {
    const threshold = report.product.msrp * report.product.alertThresholdPct;
    if (price < threshold) return true;
  }
  if (report.product.targetPrice != null && price <= report.product.targetPrice) {
    return true;
  }
  return false;
}

async function sendWebhook(webhookUrl, content, botName) {
  const payload = {
    username: botName,
    content: content,
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (resp.status === 204 || resp.status === 200) {
        console.log("Discord message sent successfully");
        return;
      }

      if (resp.status === 429) {
        const data = await resp.json();
        const retryAfter = data.retry_after || 5;
        console.warn(`Discord rate limited, retrying after ${retryAfter}s`);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }

      console.error(`Discord error: ${resp.status}`);
    } catch (e) {
      console.error(`Discord send failed (attempt ${attempt + 1}):`, e);
      if (attempt < 2) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  console.error("All Discord send attempts failed");
}
