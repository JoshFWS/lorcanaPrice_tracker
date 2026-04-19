import { loadConfig, setLastRun, getLastPrices, setLastPrices } from "./lib/config.js";
import { getPrice } from "./lib/tcgcsv.js";
import { sendReports, formatMessage } from "./lib/discord.js";
import { detectProductType, isResultRelevant, isPriceReasonable } from "./lib/product-types.js";

// --- Alarm Setup ---

chrome.runtime.onInstalled.addListener(() => {
  scheduleAlarms();
  console.log("Lorcana Price Tracker installed");
});

chrome.runtime.onStartup.addListener(() => {
  scheduleAlarms();
});

async function scheduleAlarms() {
  const config = await loadConfig();
  await chrome.alarms.clearAll();

  if (config.paranoidMode) {
    // Paranoid mode: schedule next check at a random time
    scheduleNextParanoidCheck(config.checksPerHour);
    return;
  }

  // Interval mode takes precedence over fixed times when > 0
  const intervalHours = Number(config.scheduleIntervalHours) || 0;
  if (intervalHours > 0) {
    const periodInMinutes = intervalHours * 60;
    chrome.alarms.create("priceCheck_interval", {
      delayInMinutes: periodInMinutes,
      periodInMinutes,
    });
    console.log(`Alarm scheduled: every ${intervalHours} hour(s)`);
    return;
  }

  // Fixed daily times
  for (const time of config.scheduleTimes) {
    const [hours, minutes] = time.split(":").map(Number);
    const alarmName = `priceCheck_${time}`;

    const now = new Date();
    const next = new Date();
    next.setHours(hours, minutes, 0, 0);
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    chrome.alarms.create(alarmName, {
      when: next.getTime(),
      periodInMinutes: 24 * 60,
    });

    console.log(`Alarm scheduled: ${alarmName} at ${next.toLocaleString()}`);
  }
}

function scheduleNextParanoidCheck(checksPerHour) {
  const checks = Math.max(1, Math.min(checksPerHour, 12));
  const intervalMinutes = 60 / checks;
  // Random jitter: ±40% of the interval
  const jitter = intervalMinutes * 0.4;
  const delay = intervalMinutes + (Math.random() * jitter * 2 - jitter);
  const delayMinutes = Math.max(1, delay);

  chrome.alarms.create("paranoidCheck", {
    delayInMinutes: delayMinutes,
  });

  console.log(`Paranoid mode: next check in ${delayMinutes.toFixed(1)} minutes`);
}

// --- Alarm Handler ---

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "paranoidCheck") {
    console.log("Paranoid check fired");
    await runPriceCheck();
    // Schedule the next randomized check
    const config = await loadConfig();
    scheduleNextParanoidCheck(config.checksPerHour);
  } else if (alarm.name.startsWith("priceCheck")) {
    console.log(`Alarm fired: ${alarm.name}`);
    await runPriceCheck();
  }
});

// --- Message Handler (from popup "Run Now" and content script) ---

const pendingSearches = new Map(); // tabId -> resolve function

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "RUN_NOW") {
    runPriceCheck(/* forceSend */ true).then(() => sendResponse({ success: true }));
    return true; // async response
  }

  if (message.type === "SEARCH_RESULTS" && sender.tab) {
    const resolve = pendingSearches.get(sender.tab.id);
    if (resolve) {
      resolve(message.data);
      pendingSearches.delete(sender.tab.id);
    }
    // Close the background tab
    chrome.tabs.remove(sender.tab.id);
  }
});

// --- Price Check Logic ---

async function runPriceCheck(forceSend = false) {
  console.log("=== Starting price check ===");
  const config = await loadConfig();

  if (!config.webhookUrl) {
    console.error("No webhook URL configured");
    return;
  }

  const reports = [];

  for (const product of config.products) {
    try {
      const report = await checkProduct(config, product);
      reports.push(report);
    } catch (e) {
      console.error(`Error checking ${product.name}:`, e);
      reports.push({
        product,
        tcgplayer: null,
        webPrices: [],
        checkedAt: Date.now(),
        lowestPrice: null,
        isAlert: false,
        isDeal: false,
        errors: [`Error: ${e.message}`],
      });
    }
  }

  // Build price snapshot for change detection
  const newPrices = {};
  for (const r of reports) {
    newPrices[r.product.name] = r.lowestPrice;
  }

  // In paranoid mode, only send if prices changed
  let shouldSend = true;
  if (config.paranoidMode && !forceSend) {
    const oldPrices = await getLastPrices();
    if (oldPrices) {
      shouldSend = JSON.stringify(oldPrices) !== JSON.stringify(newPrices);
    }
  }

  if (shouldSend) {
    await sendReports(config.webhookUrl, reports, config.botName);
    console.log("Discord update sent");
  } else {
    console.log("Prices unchanged — skipping Discord update (paranoid mode)");
  }

  await setLastPrices(newPrices);
  await setLastRun(Date.now());

  console.log("=== Price check finished ===");
}

async function checkProduct(config, product) {
  const errors = [];
  let tcgplayer = null;
  let webPrices = [];

  // Source 1: TCGPlayer via tcgcsv.com
  if (product.groupId) {
    try {
      tcgplayer = await getPrice(
        config.categoryId,
        product.groupId,
        product.productId,
        product.name,
        product.variant || "Normal"
      );
      if (tcgplayer) {
        console.log(`  TCGPlayer: market=$${tcgplayer.marketPrice}, low=$${tcgplayer.lowPrice}`);
      } else {
        errors.push("Product not found on TCGPlayer");
      }
    } catch (e) {
      errors.push(`TCGPlayer error: ${e.message}`);
    }
  }

  // Source 2: Web search via background tab
  if (product.searchTerms) {
    try {
      webPrices = await searchWebPrices(product.searchTerms, product.name, product.msrp, product.targetPrice);
      for (const wp of webPrices) {
        console.log(`  Web: $${wp.price.toFixed(2)} at ${wp.source}`);
      }
    } catch (e) {
      errors.push(`Web search error: ${e.message}`);
    }
  }

  // Source 3: Priority retailers (always reported)
  let priorityResults = [];
  if (product.searchTerms) {
    try {
      priorityResults = await searchPriorityRetailers(product.searchTerms, product.name, product.msrp);
      for (const pr of priorityResults) {
        if (pr.status === "available") {
          console.log(`  Priority ${pr.retailer}: $${pr.price.toFixed(2)}`);
        } else {
          console.log(`  Priority ${pr.retailer}: ${pr.status}`);
        }
      }
    } catch (e) {
      errors.push(`Priority search error: ${e.message}`);
    }
  }

  // Calculate lowest price (including any available priority retailer prices)
  const allPrices = [];
  if (tcgplayer && tcgplayer.lowPrice != null) allPrices.push(tcgplayer.lowPrice);
  for (const wp of webPrices) allPrices.push(wp.price);
  for (const pr of priorityResults) {
    if (pr.status === "available" && pr.price != null) allPrices.push(pr.price);
  }
  const lowestPrice = allPrices.length > 0 ? Math.min(...allPrices) : null;

  // Alert logic
  let isAlert = false;
  let isDeal = false;
  if (lowestPrice != null) {
    if (product.msrp != null) {
      isAlert = lowestPrice < product.msrp * product.alertThresholdPct;
    }
    if (product.targetPrice != null) {
      isDeal = lowestPrice <= product.targetPrice;
    }
  }

  return {
    product,
    tcgplayer,
    webPrices,
    priorityResults,
    checkedAt: Date.now(),
    lowestPrice,
    isAlert,
    isDeal,
    errors,
  };
}

// --- Web Search via Background Tab ---

async function searchWebPrices(searchTerms, name, msrp, targetPrice) {
  const productType = detectProductType(searchTerms, name);
  console.log(`Detected product type: ${productType}`);

  const queries = buildQueries(searchTerms, msrp, targetPrice);
  const allResults = [];

  for (const query of queries) {
    try {
      const results = await runGoogleSearch(query);
      allResults.push(...results);
    } catch (e) {
      console.warn(`Search failed for "${query}":`, e);
    }
    // Delay between searches
    await new Promise((r) => setTimeout(r, 2000));
  }

  // Process results: extract lowest prices per source
  return processSearchResults(allResults, msrp, productType, searchTerms);
}

function buildQueries(searchTerms, msrp, targetPrice) {
  const year = new Date().getFullYear();
  const queries = [];

  queries.push(`"${searchTerms}" price ${year}`);

  const basePrice = targetPrice || (msrp ? msrp * 0.8 : null);
  if (basePrice && basePrice >= 10) {
    const p1 = `$${(basePrice - 10).toFixed(2)}`;
    const p2 = `$${basePrice.toFixed(2)}`;
    const p3 = `$${(basePrice + 10).toFixed(2)}`;
    queries.push(`"${searchTerms}" "${p1}" OR "${p2}" OR "${p3}"`);
  }

  queries.push(`"${searchTerms}" cheapest buy deal`);

  return queries;
}

function runGoogleSearch(query) {
  return new Promise((resolve, reject) => {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&_lpt=1`;

    chrome.tabs.create({ url: searchUrl, active: false }, (tab) => {
      const tabId = tab.id;

      // Set a timeout in case the content script doesn't respond
      const timeout = setTimeout(() => {
        pendingSearches.delete(tabId);
        chrome.tabs.remove(tabId).catch(() => {});
        resolve([]);
      }, 10000);

      pendingSearches.set(tabId, (results) => {
        clearTimeout(timeout);
        resolve(results);
      });
    });
  });
}

const SOLD_OUT_PHRASES = [
  "sold out", "out of stock", "currently unavailable", "no longer available",
  "not available", "unavailable", "backordered", "pre-order sold out",
  "notify me when available", "notify when available", "email when available",
];

function processSearchResults(results, msrp, productType, searchTerms) {
  const SKIP_DOMAINS = new Set([
    "reddit.com", "youtube.com", "twitter.com", "x.com",
    "facebook.com", "wikipedia.org", "wiki.gg",
  ]);

  const bySource = new Map();

  for (const result of results) {
    let host;
    try {
      host = new URL(result.url).hostname.replace(/^www\./, "");
      if (SKIP_DOMAINS.has(host)) continue;
    } catch {
      continue;
    }

    // Check if this result is about the right product type
    if (!isResultRelevant(result.title || "", result.snippet || "", result.url, productType, searchTerms)) {
      continue;
    }

    // Skip sold-out / out-of-stock items
    const resultText = `${result.title || ""} ${result.snippet || ""}`.toLowerCase();
    if (SOLD_OUT_PHRASES.some((phrase) => resultText.includes(phrase))) {
      continue;
    }

    for (const price of result.prices) {
      // Filter prices that aren't reasonable for this product type
      if (!isPriceReasonable(price, msrp, productType)) continue;

      const key = result.source.toLowerCase();
      if (!bySource.has(key) || price < bySource.get(key).price) {
        bySource.set(key, {
          price,
          source: result.source,
          url: result.url,
          snippet: result.snippet || "",
        });
      }
    }
  }

  // Sort by price, return top 3
  return [...bySource.values()]
    .sort((a, b) => a.price - b.price)
    .slice(0, 3);
}

// --- Priority Retailer Search ---

const PRIORITY_RETAILERS = [
  { domain: "gamenerdz.com", name: "GameNerdz" },
  { domain: "doubleinfinitygaming.com", name: "Double Infinity Gaming" },
];

async function searchPriorityRetailers(searchTerms, productName, msrp) {
  const productType = detectProductType(searchTerms, productName);
  const results = [];

  for (const retailer of PRIORITY_RETAILERS) {
    results.push(await searchSinglePriorityRetailer(retailer, searchTerms, productType, msrp));
    await new Promise((r) => setTimeout(r, 2000));
  }

  return results;
}

async function searchSinglePriorityRetailer(retailer, searchTerms, productType, msrp) {
  const query = `site:${retailer.domain} "${searchTerms}"`;
  console.log(`Priority search: ${query}`);

  let rawResults;
  try {
    rawResults = await runGoogleSearch(query);
  } catch (e) {
    return {
      retailer: retailer.name,
      domain: retailer.domain,
      status: "error",
      price: null,
      url: null,
      message: e.message || String(e),
    };
  }

  let bestPrice = null;
  let bestUrl = null;
  let anyMatched = false;
  let anySoldOut = false;

  for (const result of rawResults) {
    let host;
    try {
      host = new URL(result.url).hostname.replace(/^www\./, "");
    } catch {
      continue;
    }
    if (host !== retailer.domain) continue;

    if (!isResultRelevant(result.title || "", result.snippet || "", result.url, productType, searchTerms)) {
      continue;
    }

    anyMatched = true;
    const text = `${result.title || ""} ${result.snippet || ""}`.toLowerCase();
    if (SOLD_OUT_PHRASES.some((p) => text.includes(p))) {
      anySoldOut = true;
      continue;
    }

    for (const price of result.prices || []) {
      if (!isPriceReasonable(price, msrp, productType)) continue;
      if (bestPrice === null || price < bestPrice) {
        bestPrice = price;
        bestUrl = result.url;
      }
    }
  }

  if (bestPrice !== null) {
    return {
      retailer: retailer.name,
      domain: retailer.domain,
      status: "available",
      price: bestPrice,
      url: bestUrl,
      message: "",
    };
  }
  if (anyMatched && anySoldOut) {
    return {
      retailer: retailer.name,
      domain: retailer.domain,
      status: "sold_out",
      price: null,
      url: null,
      message: "",
    };
  }
  return {
    retailer: retailer.name,
    domain: retailer.domain,
    status: "not_found",
    price: null,
    url: null,
    message: "",
  };
}
