import { loadConfig, getSnapshots, setSnapshots, setLastRun, getBackoffState, setBackoffState } from "./lib/config.js";
import { sendWorkUpdateNotification, sendNewWorksNotification } from "./lib/discord.js";
import { ALARM_NAME, scheduleAlarms, scheduleNextParanoidCheck, getInterRequestDelay } from "./lib/scheduler.js";

// AO3 category IDs for building search URLs
const AO3_CATEGORY_IDS = {
  "F/F": 116,
  "F/M": 22,
  "Gen": 21,
  "M/M": 23,
  "Multi": 2246,
  "Other": 24,
};

// --- Lifecycle ---

chrome.runtime.onInstalled.addListener(() => {
  initAlarms();
  console.log("AO3 Work Tracker installed");
});

chrome.runtime.onStartup.addListener(() => {
  initAlarms();
});

async function initAlarms() {
  const config = await loadConfig();
  await scheduleAlarms(config);
}

// --- Alarm Handler ---

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    console.log("AO3 check alarm fired");
    await runCheck();

    // Reschedule if paranoid mode
    const config = await loadConfig();
    if (config.paranoidMode) {
      const backoff = await getBackoffState();
      scheduleNextParanoidCheck(config.checksPerHour, backoff.multiplier);
    }
  }
});

// --- Message Handler ---

const pendingRequests = new Map(); // tabId -> { resolve, type }

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "RUN_NOW") {
    runCheck(true).then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.type === "RESCHEDULE") {
    initAlarms().then(() => sendResponse({ success: true }));
    return true;
  }

  if ((message.type === "WORK_DATA" || message.type === "SEARCH_RESULTS") && sender.tab) {
    const pending = pendingRequests.get(sender.tab.id);
    if (pending) {
      pending.resolve(message.data);
      pendingRequests.delete(sender.tab.id);
      // Only remove the tab if we owned the pending request.
      // If the timeout already fired, the fallback handler owns tab cleanup.
      chrome.tabs.remove(sender.tab.id).catch(() => {});
    }
  }
});

// --- Core Check Logic ---

async function runCheck(forceSend = false) {
  console.log("=== AO3 check starting ===");
  const config = await loadConfig();

  if (!config.webhookUrl) {
    console.error("No webhook URL configured");
    return;
  }

  const snapshots = await getSnapshots();
  const notifications = [];
  let rateLimited = false;

  // Build a shuffled queue of all items to check
  const queue = [];
  for (const work of config.trackedWorks) {
    queue.push({ type: "work", item: work });
  }
  for (const search of config.trackedSearches) {
    queue.push({ type: "search", item: search });
  }
  shuffleArray(queue);

  // Process sequentially with delays
  for (let i = 0; i < queue.length; i++) {
    const entry = queue[i];

    if (entry.type === "work") {
      const result = await checkWork(entry.item, snapshots, forceSend);
      if (result === "RATE_LIMITED") {
        rateLimited = true;
        break;
      }
      if (result) notifications.push(result);
    } else {
      const result = await checkSearch(entry.item, snapshots, forceSend);
      if (result === "RATE_LIMITED") {
        rateLimited = true;
        break;
      }
      if (result) notifications.push(result);
    }

    // Delay between requests (skip after the last one)
    if (i < queue.length - 1) {
      await new Promise((r) => setTimeout(r, getInterRequestDelay()));
    }
  }

  // Handle rate limiting
  const backoff = await getBackoffState();
  if (rateLimited) {
    const newConsecutive = backoff.consecutiveLimits + 1;
    const newMultiplier = newConsecutive >= 3 ? 4 : backoff.multiplier * 2;
    await setBackoffState({ consecutiveLimits: newConsecutive, multiplier: newMultiplier });
    console.warn(`Rate limited! Consecutive: ${newConsecutive}, multiplier: ${newMultiplier}x`);
  } else {
    // Reset backoff on success
    if (backoff.consecutiveLimits > 0) {
      await setBackoffState({ consecutiveLimits: 0, multiplier: 1 });
    }
  }

  // Send notifications
  for (const notification of notifications) {
    try {
      if (notification.type === "workUpdate") {
        await sendWorkUpdateNotification(
          config.webhookUrl,
          config.botName,
          notification.work,
          notification.oldSnapshot,
          notification.newData
        );
      } else if (notification.type === "newWorks") {
        await sendNewWorksNotification(
          config.webhookUrl,
          config.botName,
          notification.search,
          notification.newWorks,
          notification.searchUrl
        );
      }
      // Brief delay between Discord messages
      await new Promise((r) => setTimeout(r, 1000));
    } catch (e) {
      console.error("Failed to send notification:", e);
    }
  }

  // Save snapshots and last run
  await setSnapshots(snapshots);
  await setLastRun(Date.now());
  console.log(`=== AO3 check finished (${notifications.length} notifications) ===`);
}

// --- Work Checking ---

async function checkWork(work, snapshots, forceSend) {
  console.log(`Checking work: ${work.label || work.workId}`);

  const data = await fetchWorkData(work.url);
  if (!data) return null;
  if (data.error === "RATE_LIMITED") return "RATE_LIMITED";

  const oldSnapshot = snapshots.workSnapshots[work.workId] || null;
  const changed =
    !oldSnapshot ||
    oldSnapshot.publishedDate !== data.publishedDate ||
    oldSnapshot.updatedDate !== data.updatedDate;

  // Update snapshot
  snapshots.workSnapshots[work.workId] = {
    publishedDate: data.publishedDate,
    updatedDate: data.updatedDate,
    title: data.title,
    author: data.author,
    wordCount: data.wordCount,
    chapters: data.chapters,
    kudos: data.kudos,
    complete: data.complete,
    checkedAt: Date.now(),
  };

  if (changed && (oldSnapshot || forceSend)) {
    return {
      type: "workUpdate",
      work,
      oldSnapshot,
      newData: data,
    };
  }

  return null;
}

// --- Search Checking ---

async function checkSearch(search, snapshots, forceSend) {
  console.log(`Checking search: ${search.name}`);

  const searchUrl = buildSearchUrl(search.filters);
  const data = await fetchSearchData(searchUrl);
  if (!data) return null;
  if (data.error === "RATE_LIMITED") return "RATE_LIMITED";

  const oldSnapshot = snapshots.searchSnapshots[search.id] || null;
  const oldKnownIds = new Set(oldSnapshot?.knownWorkIds || []);
  const currentIds = data.works.map((w) => w.workId).filter(Boolean);

  // Find new works (not seen before)
  const newWorks = oldKnownIds.size === 0 && !forceSend
    ? [] // First run: don't notify for all existing works
    : data.works.filter((w) => w.workId && !oldKnownIds.has(w.workId));

  // Update snapshot (keep last 500 IDs to prevent unbounded growth)
  const allKnownIds = [...new Set([...oldKnownIds, ...currentIds])];
  snapshots.searchSnapshots[search.id] = {
    knownWorkIds: allKnownIds.slice(-500),
    lastCheckedAt: Date.now(),
    totalWorks: data.totalWorks,
  };

  if (newWorks.length > 0) {
    return {
      type: "newWorks",
      search,
      newWorks,
      searchUrl: searchUrl.replace("&_ao3t=1", ""),
    };
  }

  return null;
}

// --- Background Tab Fetching ---

function fetchWorkData(url) {
  return openBackgroundTab(url, "WORK_DATA");
}

function fetchSearchData(url) {
  return openBackgroundTab(url, "SEARCH_RESULTS");
}

function openBackgroundTab(url, expectedType) {
  return new Promise((resolve) => {
    // Add marker parameter
    const separator = url.includes("?") ? "&" : "?";
    const markedUrl = `${url}${separator}_ao3t=1`;

    chrome.tabs.create({ url: markedUrl, active: false }, (tab) => {
      if (!tab) {
        resolve(null);
        return;
      }

      const tabId = tab.id;

      // Timeout: 15 seconds
      const timeout = setTimeout(() => {
        console.warn(`Tab ${tabId} timed out for ${expectedType}`);
        pendingRequests.delete(tabId);

        // Try executeScript as fallback (it handles tab cleanup on success/failure)
        tryFallbackScript(tabId, expectedType, resolve);
      }, 15000);

      pendingRequests.set(tabId, {
        resolve: (data) => {
          clearTimeout(timeout);
          resolve(data);
        },
        type: expectedType,
      });
    });
  });
}

async function tryFallbackScript(tabId, expectedType, resolve) {
  try {
    const scriptFile = expectedType === "WORK_DATA"
      ? "content-scripts/ao3-work.js"
      : "content-scripts/ao3-search.js";

    await chrome.scripting.executeScript({
      target: { tabId },
      files: [scriptFile],
    });

    // Give the injected script a moment to run and send its message
    const fallbackTimeout = setTimeout(() => {
      pendingRequests.delete(tabId);
      chrome.tabs.remove(tabId).catch(() => {});
      resolve(null);
    }, 5000);

    pendingRequests.set(tabId, {
      resolve: (data) => {
        clearTimeout(fallbackTimeout);
        resolve(data);
      },
      type: expectedType,
    });
  } catch (e) {
    console.error("Fallback script injection failed:", e);
    chrome.tabs.remove(tabId).catch(() => {});
    resolve(null);
  }
}

// --- Search URL Builder ---

function buildSearchUrl(filters) {
  // Must use /works/search (not /works) to support advanced filters like kudos, hits, word count
  const base = "https://archiveofourown.org/works/search";
  const params = new URLSearchParams();
  params.set("utf8", "\u2713");
  params.set("work_search[sort_column]", filters.sortBy || "revised_at");
  params.set("work_search[sort_direction]", "desc");

  if (filters.categories && filters.categories.length > 0) {
    for (const cat of filters.categories) {
      const id = AO3_CATEGORY_IDS[cat];
      if (id) params.append("work_search[category_ids][]", id);
    }
  }

  if (filters.fandoms) {
    params.set("work_search[fandom_names]", filters.fandoms);
  }

  if (filters.relationships) {
    params.set("work_search[relationship_names]", filters.relationships);
  }

  if (filters.characters) {
    params.set("work_search[character_names]", filters.characters);
  }

  if (filters.additionalTags) {
    params.set("work_search[freeform_names]", filters.additionalTags);
  }

  if (filters.language) {
    params.set("work_search[language_id]", filters.language);
  }

  // Word count uses range format: "1000-", "-5000", or "1000-5000"
  if (filters.wordCountMin || filters.wordCountMax) {
    const min = filters.wordCountMin || "";
    const max = filters.wordCountMax || "";
    params.set("work_search[word_count]", `${min}-${max}`);
  }

  // Kudos and hits require ">" prefix for minimum threshold
  if (filters.minKudos) {
    params.set("work_search[kudos_count]", `>${filters.minKudos}`);
  }

  if (filters.minHits) {
    params.set("work_search[hits]", `>${filters.minHits}`);
  }

  if (filters.complete === true) {
    params.set("work_search[complete]", "T");
  }

  return `${base}?${params.toString()}`;
}

// --- Utility ---

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
