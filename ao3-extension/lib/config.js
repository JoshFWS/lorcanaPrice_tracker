// Default configuration
const DEFAULT_CONFIG = {
  webhookUrl: "",
  botName: "AO3 Tracker",
  paranoidMode: true,
  checksPerHour: 2,
  trackedWorks: [],
  trackedSearches: [],
};

export async function loadConfig() {
  const data = await chrome.storage.sync.get("ao3Config");
  if (data.ao3Config) {
    return { ...DEFAULT_CONFIG, ...data.ao3Config };
  }
  return { ...DEFAULT_CONFIG };
}

export async function saveConfig(config) {
  await chrome.storage.sync.set({ ao3Config: config });
}

// --- Snapshot storage (local, can grow large) ---

export async function getSnapshots() {
  const data = await chrome.storage.local.get("ao3Snapshots");
  return data.ao3Snapshots || { workSnapshots: {}, searchSnapshots: {} };
}

export async function setSnapshots(snapshots) {
  await chrome.storage.local.set({ ao3Snapshots: snapshots });
}

export async function getWorkSnapshot(workId) {
  const snapshots = await getSnapshots();
  return snapshots.workSnapshots[workId] || null;
}

export async function setWorkSnapshot(workId, snapshot) {
  const snapshots = await getSnapshots();
  snapshots.workSnapshots[workId] = snapshot;
  await setSnapshots(snapshots);
}

export async function getSearchSnapshot(searchId) {
  const snapshots = await getSnapshots();
  return snapshots.searchSnapshots[searchId] || null;
}

export async function setSearchSnapshot(searchId, snapshot) {
  const snapshots = await getSnapshots();
  snapshots.searchSnapshots[searchId] = snapshot;
  await setSnapshots(snapshots);
}

// --- Last run tracking ---

export async function getLastRun() {
  const data = await chrome.storage.local.get("ao3LastRun");
  return data.ao3LastRun || null;
}

export async function setLastRun(timestamp) {
  await chrome.storage.local.set({ ao3LastRun: timestamp });
}

// --- Rate limit backoff state ---

export async function getBackoffState() {
  const data = await chrome.storage.local.get("ao3Backoff");
  return data.ao3Backoff || { consecutiveLimits: 0, multiplier: 1 };
}

export async function setBackoffState(state) {
  await chrome.storage.local.set({ ao3Backoff: state });
}

export { DEFAULT_CONFIG };
