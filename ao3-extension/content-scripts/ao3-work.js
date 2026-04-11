// Content script that runs on individual AO3 work pages.
// Only activates when opened by the extension (detected via _ao3t URL parameter).

(function () {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("_ao3t")) return;

  // Check for rate limit page
  if (isRateLimitPage()) {
    chrome.runtime.sendMessage({
      type: "WORK_DATA",
      data: { error: "RATE_LIMITED" },
    });
    return;
  }

  // Wait for page to fully render
  setTimeout(() => {
    const data = parseWorkPage();
    chrome.runtime.sendMessage({
      type: "WORK_DATA",
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

  function parseWorkPage() {
    const meta = {};

    // Work ID from URL
    const idMatch = window.location.pathname.match(/\/works\/(\d+)/);
    meta.workId = idMatch ? idMatch[1] : null;
    meta.url = idMatch
      ? `https://archiveofourown.org/works/${idMatch[1]}`
      : window.location.href.split("?")[0];

    // Title
    meta.title = document.querySelector("h2.title.heading")?.textContent?.trim() || null;

    // Author
    meta.author = document.querySelector("a[rel='author']")?.textContent?.trim() || null;

    // Published date
    meta.publishedDate = document.querySelector("dd.published")?.textContent?.trim() || null;

    // Updated / status date
    meta.updatedDate = document.querySelector("dd.status")?.textContent?.trim() || null;

    // Word count
    const wordsText = document.querySelector("dd.words")?.textContent?.trim();
    meta.wordCount = wordsText ? parseInt(wordsText.replace(/,/g, ""), 10) : null;

    // Chapters
    meta.chapters = document.querySelector("dd.chapters")?.textContent?.trim() || null;

    // Kudos
    const kudosText = document.querySelector("dd.kudos a")?.textContent?.trim();
    meta.kudos = kudosText ? parseInt(kudosText.replace(/,/g, ""), 10) : 0;

    // Hits
    const hitsText = document.querySelector("dd.hits")?.textContent?.trim();
    meta.hits = hitsText ? parseInt(hitsText.replace(/,/g, ""), 10) : 0;

    // Tags
    meta.fandoms = extractTags("dd.fandom.tags a.tag");
    meta.relationships = extractTags("dd.relationship.tags a.tag");
    meta.characters = extractTags("dd.character.tags a.tag");
    meta.additionalTags = extractTags("dd.freeform.tags a.tag");
    meta.categories = extractTags("dd.category.tags a.tag");

    // Rating
    meta.rating = document.querySelector("dd.rating.tags a.tag")?.textContent?.trim() || null;

    // Language
    meta.language = document.querySelector("dd.language")?.textContent?.trim() || null;

    // Completion status
    const chaptersText = meta.chapters || "";
    if (chaptersText.includes("/")) {
      const parts = chaptersText.split("/");
      meta.complete = parts[0] === parts[1] && parts[1] !== "?";
    } else {
      meta.complete = false;
    }

    return meta;
  }

  function extractTags(selector) {
    return [...document.querySelectorAll(selector)].map((el) => el.textContent.trim());
  }
})();
