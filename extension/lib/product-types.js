/**
 * Product type detection and filtering for Lorcana price searches.
 *
 * Ensures that web search results match the actual product being searched for
 * (e.g. a booster box search doesn't return single card prices).
 *
 * This is a JavaScript port of tracker/product_types.py — keep in sync.
 */

const PRODUCT_TYPES = {
  booster_box: {
    keywords: ["booster box", "booster display", "display 24", "24 pack"],
    negativeKeywords: ["single card", "individual card", "singles", "booster pack single"],
    msrpFloorRatio: 0.3,
    hardFloor: 40.0,
  },
  trove: {
    keywords: ["trove", "illumineer"],
    negativeKeywords: ["booster box", "booster display", "display 24", "single card", "singles"],
    msrpFloorRatio: 0.3,
    hardFloor: 15.0,
  },
  booster_pack: {
    keywords: ["booster pack", "single pack"],
    negativeKeywords: ["booster box", "booster display", "display 24"],
    msrpFloorRatio: 0.3,
    hardFloor: 3.0,
  },
  starter_deck: {
    keywords: ["starter deck"],
    negativeKeywords: ["booster box", "single card", "singles"],
    msrpFloorRatio: 0.3,
    hardFloor: 8.0,
  },
  gift_set: {
    keywords: ["gift set", "bundle"],
    negativeKeywords: ["booster box", "single card", "singles"],
    msrpFloorRatio: 0.3,
    hardFloor: 15.0,
  },
  single_card: {
    keywords: ["card"],
    negativeKeywords: ["booster box", "sealed", "booster display", "display 24", "trove"],
    msrpFloorRatio: 0.1,
    hardFloor: 0.25,
  },
  unknown: {
    keywords: [],
    negativeKeywords: [],
    msrpFloorRatio: 0.1,
    hardFloor: 1.0,
  },
};

// Check more-specific types first
const DETECTION_ORDER = [
  "booster_box",
  "trove",
  "booster_pack",
  "starter_deck",
  "gift_set",
  "single_card",
];

/**
 * Determine the product type from search terms and product name.
 */
export function detectProductType(searchTerms, name) {
  const combined = `${searchTerms} ${name}`.toLowerCase();

  for (const typeKey of DETECTION_ORDER) {
    const typeDef = PRODUCT_TYPES[typeKey];
    for (const keyword of typeDef.keywords) {
      if (combined.includes(keyword)) {
        return typeKey;
      }
    }
  }

  return "unknown";
}

/**
 * Check whether a search result is about the correct product type.
 */
export function isResultRelevant(title, snippet, url, productType, searchTerms) {
  const typeDef = PRODUCT_TYPES[productType] || PRODUCT_TYPES.unknown;
  const combined = `${title} ${snippet}`.toLowerCase();

  // Check for negative keywords
  for (const negKw of typeDef.negativeKeywords) {
    if (combined.includes(negKw)) {
      const hasPositive = typeDef.keywords.some((kw) => combined.includes(kw));
      if (!hasPositive) {
        return false;
      }
    }
  }

  // For known product types, require at least one identifying keyword
  if (productType !== "unknown" && typeDef.keywords.length > 0) {
    const hasTypeKeyword = typeDef.keywords.some((kw) => combined.includes(kw));
    const isProductPage = ["/product/", "/item/", "/dp/", "/ip/", "/products/"].some((seg) =>
      url.toLowerCase().includes(seg)
    );
    const searchWords = new Set(searchTerms.toLowerCase().split(/\s+/));
    const resultWords = new Set(combined.split(/\s+/));
    let wordOverlap = 0;
    for (const w of searchWords) {
      if (resultWords.has(w)) wordOverlap++;
    }
    const hasGoodOverlap = wordOverlap >= Math.min(3, searchWords.size);

    if (!hasTypeKeyword && !isProductPage && !hasGoodOverlap) {
      return false;
    }
  }

  return true;
}

/**
 * Check whether a price is within the expected range for a product type.
 */
export function isPriceReasonable(price, msrp, productType) {
  const typeDef = PRODUCT_TYPES[productType] || PRODUCT_TYPES.unknown;

  if (price < typeDef.hardFloor) {
    return false;
  }

  if (msrp != null) {
    if (price < msrp * typeDef.msrpFloorRatio) {
      return false;
    }
    if (price > msrp * 2.0) {
      return false;
    }
  }

  return true;
}
