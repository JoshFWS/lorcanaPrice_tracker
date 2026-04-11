const BASE_URL = "https://tcgcsv.com";

// In-memory cache for the service worker's lifetime
const cache = new Map();

export async function getPrice(categoryId, groupId, productId, productName, variant = "Normal") {
  const { products, prices } = await fetchGroupData(categoryId, groupId);

  // Find product by ID or name
  let product = null;
  if (productId) {
    product = products.find((p) => p.productId === productId);
  }
  if (!product && productName) {
    product = fuzzyMatch(products, productName);
  }

  if (!product) {
    console.warn(`Product not found: ${productId || productName} in group ${groupId}`);
    return null;
  }

  // Find price entry matching variant
  let priceEntry = prices.find(
    (p) => p.productId === product.productId && p.subTypeName === variant
  );

  // Fallback: any price for this product
  if (!priceEntry) {
    priceEntry = prices.find((p) => p.productId === product.productId);
  }

  if (!priceEntry) {
    console.warn(`No price data for ${product.name}`);
    return null;
  }

  return {
    productName: product.name,
    lowPrice: priceEntry.lowPrice,
    marketPrice: priceEntry.marketPrice,
    midPrice: priceEntry.midPrice,
    highPrice: priceEntry.highPrice,
    productUrl: product.url,
    imageUrl: product.imageUrl,
    subType: priceEntry.subTypeName || "Normal",
  };
}

async function fetchGroupData(categoryId, groupId) {
  const cacheKey = `${categoryId}-${groupId}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const productsUrl = `${BASE_URL}/tcgplayer/${categoryId}/${groupId}/products`;
  const pricesUrl = `${BASE_URL}/tcgplayer/${categoryId}/${groupId}/prices`;

  const [productsResp, pricesResp] = await Promise.all([
    fetch(productsUrl),
    fetch(pricesUrl),
  ]);

  if (!productsResp.ok || !pricesResp.ok) {
    throw new Error(`Failed to fetch data for group ${groupId}`);
  }

  const productsData = await productsResp.json();
  const pricesData = await pricesResp.json();

  const result = {
    products: productsData.results,
    prices: pricesData.results,
  };

  cache.set(cacheKey, result);
  return result;
}

function fuzzyMatch(products, name) {
  const nameLower = name.toLowerCase();

  // Exact match
  const exact = products.find(
    (p) =>
      p.cleanName.toLowerCase() === nameLower ||
      p.name.toLowerCase() === nameLower
  );
  if (exact) return exact;

  // Substring match
  const substring = products.filter((p) => {
    const pname = p.cleanName.toLowerCase();
    return nameLower.includes(pname) || pname.includes(nameLower);
  });
  if (substring.length === 1) return substring[0];

  // Word overlap
  const nameWords = new Set(nameLower.split(/\s+/));
  let best = null;
  let bestScore = 0;
  for (const p of products) {
    const pWords = new Set(p.cleanName.toLowerCase().split(/\s+/));
    const overlap = [...nameWords].filter((w) => pWords.has(w)).length;
    if (overlap > bestScore) {
      bestScore = overlap;
      best = p;
    }
  }

  return bestScore >= 2 ? best : null;
}
