// Content script that runs on AO3 search/filter result pages.
// Only activates when opened by the extension (detected via _ao3t URL parameter).

(function () {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("_ao3t")) return;

  // Check for rate limit page
  if (isRateLimitPage()) {
    chrome.runtime.sendMessage({
      type: "SEARCH_RESULTS",
      data: { error: "RATE_LIMITED" },
    });
    return;
  }

  // Wait for page to fully render
  setTimeout(() => {
    const data = parseSearchResults();
    chrome.runtime.sendMessage({
      type: "SEARCH_RESULTS",
      data,
    });
  }, 1500);

  function isRateLimitPage() {
    const title = document.title || "";
    if (title.toLowerCase().includes("retry later")) return true;
    const caution = document.querySelector("p.caution");
    if (caution && caution.textContent.toLowerCase().includes("retry")) return true;
    return false;
  }

  function parseSearchResults() {
    const workElements = document.querySelectorAll("li.work.blurb.group");
    const works = [];

    for (const el of workElements) {
      const titleLink = el.querySelector("h4.heading a:first-child");
      const href = titleLink?.getAttribute("href") || "";
      const workIdMatch = href.match(/\/works\/(\d+)/);

      const wordsText = el.querySelector("dd.words")?.textContent?.trim();
      const kudosText = el.querySelector("dd.kudos a")?.textContent?.trim();
      const hitsText = el.querySelector("dd.hits")?.textContent?.trim();

      works.push({
        workId: workIdMatch ? workIdMatch[1] : null,
        title: titleLink?.textContent?.trim() || null,
        author: el.querySelector("a[rel='author']")?.textContent?.trim() || null,
        date: el.querySelector("p.datetime")?.textContent?.trim() || null,
        fandoms: [...el.querySelectorAll("h5.fandoms a.tag")].map((a) => a.textContent.trim()),
        relationships: [...el.querySelectorAll("li.relationships a.tag")].map((a) => a.textContent.trim()),
        wordCount: wordsText ? parseInt(wordsText.replace(/,/g, ""), 10) : 0,
        chapters: el.querySelector("dd.chapters a")?.textContent?.trim() || null,
        kudos: kudosText ? parseInt(kudosText.replace(/,/g, ""), 10) : 0,
        hits: hitsText ? parseInt(hitsText.replace(/,/g, ""), 10) : 0,
        complete: el.querySelector("span.iswip")?.textContent?.trim()?.toLowerCase() === "complete work",
        url: workIdMatch
          ? `https://archiveofourown.org/works/${workIdMatch[1]}`
          : null,
      });
    }

    // Total works count from heading (e.g., "1523 Found" or "1523 Works found")
    const headingEl = document.querySelector("h3.heading");
    const headingText = headingEl?.textContent || "";
    const totalMatch = headingText.match(/([\d,]+)\s+(?:Works?\s+)?Found/i);
    const totalWorks = totalMatch
      ? parseInt(totalMatch[1].replace(/,/g, ""), 10)
      : works.length;

    return { totalWorks, works };
  }
})();
