// String-based AO3 HTML parser — no DOM APIs, safe to run in a service worker.

function decodeEntities(str) {
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function htmlText(raw) {
  if (!raw) return null;
  const stripped = raw.replace(/<[^>]+>/g, "").trim();
  return decodeEntities(stripped) || null;
}

function extractDdByClass(html, className) {
  const re = new RegExp(
    `<dd[^>]+class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]*?)</dd>`,
    "i"
  );
  const m = html.match(re);
  return m ? htmlText(m[1]) : null;
}

export function isRateLimitHtml(html) {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1].toLowerCase() : "";
  if (title.includes("retry later")) return true;
  if (/<p[^>]+class="[^"]*\bcaution\b[^"]*"[^>]*>[^<]*retry/i.test(html)) return true;
  return false;
}

export function parseWorkHtml(html, url) {
  const idMatch = url.match(/\/works\/(\d+)/);
  const workId = idMatch ? idMatch[1] : null;

  const titleRaw = html.match(
    /<h2[^>]+class="[^"]*\btitle\b[^"]*\bheading\b[^"]*"[^>]*>([\s\S]*?)<\/h2>/i
  )?.[1];

  const authorRaw = html.match(/<a\s[^>]*\brel="author"[^>]*>([\s\S]*?)<\/a>/i)?.[1];

  const publishedDate = extractDdByClass(html, "published");
  const updatedDate   = extractDdByClass(html, "status");
  const wordsText     = extractDdByClass(html, "words");
  const chaptersText  = extractDdByClass(html, "chapters");

  const wordCount = wordsText ? parseInt(wordsText.replace(/,/g, ""), 10) || null : null;

  let complete = false;
  if (chaptersText?.includes("/")) {
    const [cur, tot] = chaptersText.split("/");
    complete = cur.trim() === tot.trim() && tot.trim() !== "?";
  }

  return {
    workId,
    url: workId ? `https://archiveofourown.org/works/${workId}` : url,
    title: htmlText(titleRaw),
    author: htmlText(authorRaw),
    publishedDate,
    updatedDate,
    wordCount,
    chapters: chaptersText,
    complete,
  };
}
