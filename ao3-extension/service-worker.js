import { loadConfig, getSnapshots, setSnapshots, setLastRun } from "./lib/config.js";
import { sendWorkUpdatedNotification } from "./lib/discord.js";
import { ALARM_NAME, scheduleAlarm } from "./lib/scheduler.js";
import { isRateLimitHtml, parseWorkHtml } from "./lib/ao3-parser.js";

chrome.runtime.onInstalled.addListener(() => {
  loadConfig().then(scheduleAlarm);
});

chrome.runtime.onStartup.addListener(() => {
  loadConfig().then(scheduleAlarm);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) runCheck();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "RUN_NOW") {
    runCheck(true).then(() => sendResponse({ success: true }));
    return true;
  }
  if (message.type === "RESCHEDULE") {
    loadConfig().then(scheduleAlarm).then(() => sendResponse({ success: true }));
    return true;
  }
});

let checkInProgress = false;

async function runCheck(forceSend = false) {
  if (checkInProgress) {
    console.log("AO3 check already in progress, skipping");
    return;
  }
  checkInProgress = true;
  try {
    await _runCheck(forceSend);
  } finally {
    checkInProgress = false;
  }
}

async function _runCheck(forceSend) {
  const config = await loadConfig();

  if (!config.webhookUrl) {
    console.warn("AO3 Tracker: no webhook URL configured");
    return;
  }

  if (!config.trackedWorks.length) {
    console.log("AO3 Tracker: no works tracked");
    return;
  }

  console.log(`AO3 check starting: ${config.trackedWorks.length} work(s)`);
  const snapshots = await getSnapshots();

  for (let i = 0; i < config.trackedWorks.length; i++) {
    const work = config.trackedWorks[i];
    await checkWork(work, snapshots, config, forceSend);

    // Polite delay between requests
    if (i < config.trackedWorks.length - 1) {
      await sleep(15000 + Math.random() * 10000);
    }
  }

  await setSnapshots(snapshots);
  await setLastRun(Date.now());
  console.log("AO3 check complete");
}

async function checkWork(work, snapshots, config, forceSend) {
  console.log(`Checking: ${work.label || work.workId}`);

  const html = await fetchAO3(work.url);
  if (!html) return;

  if (isRateLimitHtml(html)) {
    console.warn(`Rate limited on ${work.url}`);
    return;
  }

  const data = parseWorkHtml(html, work.url);
  const old = snapshots[work.workId] || null;

  // The "updated" date (AO3 <dd class="status">) changes when a new chapter is posted.
  // Fall back to publishedDate for single-chapter works that only have a published date.
  const newDate = data.updatedDate || data.publishedDate;
  const oldDate = old?.updatedDate || old?.publishedDate || null;

  snapshots[work.workId] = {
    title: data.title,
    author: data.author,
    updatedDate: data.updatedDate,
    publishedDate: data.publishedDate,
    wordCount: data.wordCount,
    chapters: data.chapters,
    complete: data.complete,
    checkedAt: Date.now(),
  };

  const dateChanged = oldDate !== null && newDate !== null && oldDate !== newDate;

  if (forceSend || dateChanged) {
    try {
      await sendWorkUpdatedNotification(config.webhookUrl, config.botName, work, oldDate, newDate, data);
    } catch (e) {
      console.error("Failed to send notification:", e);
    }
  }
}

async function fetchAO3(url) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.text();
  } catch (e) {
    console.error(`Fetch failed for ${url}:`, e);
    return null;
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
