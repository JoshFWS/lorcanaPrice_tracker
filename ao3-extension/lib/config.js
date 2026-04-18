const DEFAULT_CONFIG = {
  webhookUrl: "",
  botName: "AO3 Tracker",
  checksPerHour: 2,
  trackedWorks: [],
};

export async function loadConfig() {
  const { ao3Config } = await chrome.storage.sync.get("ao3Config");
  return ao3Config ? { ...DEFAULT_CONFIG, ...ao3Config } : { ...DEFAULT_CONFIG };
}

export async function saveConfig(config) {
  await chrome.storage.sync.set({ ao3Config: config });
}

export async function getSnapshots() {
  const { ao3Snapshots } = await chrome.storage.local.get("ao3Snapshots");
  return ao3Snapshots || {};
}

export async function setSnapshots(snapshots) {
  await chrome.storage.local.set({ ao3Snapshots: snapshots });
}

export async function getLastRun() {
  const { ao3LastRun } = await chrome.storage.local.get("ao3LastRun");
  return ao3LastRun || null;
}

export async function setLastRun(timestamp) {
  await chrome.storage.local.set({ ao3LastRun: timestamp });
}
