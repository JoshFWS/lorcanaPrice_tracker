// Default configuration
const DEFAULT_CONFIG = {
  webhookUrl: "",
  botName: "Lorcana Price Tracker",
  categoryId: 71,
  scheduleTimes: ["09:00", "21:00"],
  paranoidMode: false,
  checksPerHour: 5,
  products: [
    {
      name: "Wilds Unknown Booster Box (Pre-Order)",
      productId: 678165,
      groupId: 24617,
      variant: "Normal",
      msrp: 143.76,
      targetPrice: 110.0,
      alertThresholdPct: 0.8,
      searchTerms: "Disney Lorcana Wilds Unknown booster box preorder",
    },
  ],
};

export async function loadConfig() {
  const data = await chrome.storage.sync.get("config");
  if (data.config) {
    return { ...DEFAULT_CONFIG, ...data.config };
  }
  return DEFAULT_CONFIG;
}

export async function saveConfig(config) {
  await chrome.storage.sync.set({ config });
}

export async function getLastRun() {
  const data = await chrome.storage.local.get("lastRun");
  return data.lastRun || null;
}

export async function setLastRun(timestamp) {
  await chrome.storage.local.set({ lastRun: timestamp });
}

export async function getLastPrices() {
  const data = await chrome.storage.local.get("lastPrices");
  return data.lastPrices || null;
}

export async function setLastPrices(prices) {
  await chrome.storage.local.set({ lastPrices: prices });
}

export { DEFAULT_CONFIG };
