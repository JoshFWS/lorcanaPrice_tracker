// Content script that runs on Google search result pages.
// Extracts prices from search snippets and sends them back to the service worker.

(function () {
  // Only activate if this tab was opened by our extension
  // We detect this via a special URL parameter
  const params = new URLSearchParams(window.location.search);
  if (!params.has("_lpt")) return;

  // Wait a moment for results to fully render
  setTimeout(() => {
    const results = extractSearchResults();
    chrome.runtime.sendMessage({
      type: "SEARCH_RESULTS",
      data: results,
    });
  }, 1500);

  function extractSearchResults() {
    const results = [];
    const PRICE_REGEX = /\$(\d{1,4}(?:\.\d{2})?)/g;

    // Google search result containers
    const resultElements = document.querySelectorAll("div.g, div[data-hveid]");

    for (const el of resultElements) {
      const linkEl = el.querySelector("a[href]");
      if (!linkEl) continue;

      const url = linkEl.href;
      if (!url || url.startsWith("https://www.google.com")) continue;

      const titleEl = el.querySelector("h3");
      const title = titleEl ? titleEl.textContent : "";

      // Get snippet text
      const snippetEl =
        el.querySelector("div[data-sncf]") ||
        el.querySelector("span.st") ||
        el.querySelector("div.VwiC3b") ||
        el.querySelector("[data-content-feature='1']");
      const snippet = snippetEl ? snippetEl.textContent : el.textContent;

      // Extract prices from title + snippet
      const fullText = `${title} ${snippet}`;
      const prices = [];
      let match;
      while ((match = PRICE_REGEX.exec(fullText)) !== null) {
        const price = parseFloat(match[1]);
        if (price >= 1.0 && price <= 5000) {
          prices.push(price);
        }
      }

      if (prices.length > 0) {
        results.push({
          url,
          title,
          snippet: snippet.slice(0, 200),
          prices,
          source: getDomainName(url),
        });
      }
    }

    return results;
  }

  function getDomainName(url) {
    try {
      let host = new URL(url).hostname;
      if (host.startsWith("www.")) host = host.slice(4);

      const NAMES = {
        "tcgplayer.com": "TCGPlayer",
        "ebay.com": "eBay",
        "amazon.com": "Amazon",
        "gamenerdz.com": "GameNerdz",
        "miniaturemarket.com": "Miniature Market",
        "coolstuffinc.com": "CoolStuffInc",
        "cardkingdom.com": "Card Kingdom",
        "trollandtoad.com": "Troll and Toad",
        "walmart.com": "Walmart",
        "target.com": "Target",
        "zulusgames.com": "Zulu's Games",
        "starcitygames.com": "Star City Games",
        "dacardworld.com": "DA Card World",
      };

      return NAMES[host] || host.replace(/\.\w+$/, "").replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    } catch {
      return "Unknown";
    }
  }
})();
