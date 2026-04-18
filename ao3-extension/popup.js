import { loadConfig, saveConfig, getLastRun, getSnapshots } from "./lib/config.js";

let config;
let snapshots;

document.addEventListener("DOMContentLoaded", async () => {
  config = await loadConfig();
  snapshots = await getSnapshots();

  renderSettings();
  renderWorks();
  updateStatus();

  document.getElementById("settingsToggle").addEventListener("click", () => {
    document.getElementById("settingsPanel").classList.toggle("hidden");
  });

  document.getElementById("addWorkBtn").addEventListener("click", addWork);
  document.getElementById("addWorkUrl").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addWork();
  });

  document.getElementById("checksPerHour").addEventListener("input", (e) => {
    document.getElementById("checksPerHourValue").textContent = e.target.value;
  });

  document.getElementById("saveSettings").addEventListener("click", handleSaveSettings);
  document.getElementById("checkNow").addEventListener("click", handleCheckNow);

  setupAuthorCursorEffect();
});

// --- Render Works ---

function renderWorks() {
  const container = document.getElementById("workList");
  container.innerHTML = "";

  if (config.trackedWorks.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">&#128214;</div>
        <div>No tracked works yet.<br>Paste an AO3 work URL below to start tracking.</div>
      </div>`;
    return;
  }

  for (const work of config.trackedWorks) {
    const snap = snapshots[work.workId] || null;
    const card = document.createElement("div");
    card.className = "card";

    const title = snap?.title || work.label || `Work #${work.workId}`;
    const author = snap?.author ? `by ${snap.author}` : "";
    const date = snap?.updatedDate || snap?.publishedDate || "Not checked yet";

    let statsHtml = "";
    if (snap) {
      const parts = [];
      if (snap.wordCount) parts.push(`${snap.wordCount.toLocaleString()} words`);
      if (snap.chapters) parts.push(`${snap.chapters} ch`);
      const statusPill = snap.complete
        ? '<span class="pill pill-green">Complete</span>'
        : '<span class="pill pill-amber">In Progress</span>';
      statsHtml = `<div class="card-stats">${parts.join(" | ")} ${statusPill}</div>`;
    }

    card.innerHTML = `
      <div class="card-header">
        <a class="card-title card-title-link" href="${escapeHtml(work.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>
        <button class="btn-remove" data-id="${work.id}" title="Remove">&times;</button>
      </div>
      ${author ? `<div class="card-author">${escapeHtml(author)}</div>` : ""}
      <div class="card-meta">Updated: ${escapeHtml(date)}</div>
      ${statsHtml}`;

    container.appendChild(card);
  }

  container.querySelectorAll(".btn-remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = e.target.dataset.id;
      config.trackedWorks = config.trackedWorks.filter((w) => w.id !== id);
      saveAndRender();
    });
  });
}

// --- Add Work ---

function addWork() {
  const input = document.getElementById("addWorkUrl");
  const url = input.value.trim();

  const match = url.match(/archiveofourown\.org\/works\/(\d+)/);
  if (!match) {
    showToast("Please enter a valid AO3 work URL", "error");
    return;
  }

  const workId = match[1];
  if (config.trackedWorks.some((w) => w.workId === workId)) {
    showToast("Already tracking this work", "error");
    return;
  }

  config.trackedWorks.push({
    id: generateId(),
    url: `https://archiveofourown.org/works/${workId}`,
    workId,
    label: `Work #${workId}`,
    addedAt: Date.now(),
  });

  input.value = "";
  saveAndRender();
  showToast("Work added! Run a check to fetch details.", "success");
}

// --- Settings ---

function renderSettings() {
  document.getElementById("webhookUrl").value = config.webhookUrl || "";
  document.getElementById("botName").value = config.botName || "AO3 Tracker";
  document.getElementById("checksPerHour").value = config.checksPerHour || 2;
  document.getElementById("checksPerHourValue").textContent = config.checksPerHour || 2;
}

async function handleSaveSettings() {
  config.webhookUrl = document.getElementById("webhookUrl").value.trim();
  config.botName = document.getElementById("botName").value.trim() || "AO3 Tracker";
  config.checksPerHour = parseInt(document.getElementById("checksPerHour").value) || 2;

  await saveConfig(config);

  try {
    await chrome.runtime.sendMessage({ type: "RESCHEDULE" });
  } catch (e) {
    console.warn("Could not notify service worker:", e);
  }

  showToast("Settings saved!", "success");
}

// --- Check Now ---

async function handleCheckNow() {
  const btn = document.getElementById("checkNow");
  btn.textContent = "Checking...";
  btn.disabled = true;

  try {
    await chrome.runtime.sendMessage({ type: "RUN_NOW" });
    snapshots = await getSnapshots();
    renderWorks();
    showToast("Check complete! See Discord for updates.", "success");
  } catch (e) {
    showToast(`Error: ${e.message}`, "error");
  }

  btn.textContent = "Check Now";
  btn.disabled = false;
  updateStatus();
}

// --- Status ---

async function updateStatus() {
  const lastRun = await getLastRun();
  const el = document.getElementById("statusText");
  el.textContent = lastRun ? `Last check: ${timeAgo(lastRun)}` : 'No checks run yet. Click "Check Now" to start.';
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// --- Helpers ---

async function saveAndRender() {
  await saveConfig(config);
  renderWorks();
}

function showToast(text, type) {
  const el = document.getElementById("toast");
  el.textContent = text;
  el.className = `toast ${type}`;
  setTimeout(() => { el.className = "toast hidden"; }, 3000);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function setupAuthorCursorEffect() {
  const link = document.getElementById("authorLink");
  const cursor = document.getElementById("customCursor");
  if (!link || !cursor) return;

  const THRESHOLD = 100;

  document.addEventListener("mousemove", (e) => {
    const rect = link.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < THRESHOLD) {
      const scale = 1 + 2 * (1 - dist / THRESHOLD);
      cursor.style.display = "block";
      cursor.style.left = e.clientX + "px";
      cursor.style.top = e.clientY + "px";
      cursor.style.transform = `translate(-50%, -50%) scale(${scale})`;
      document.body.style.cursor = "none";
    } else {
      cursor.style.display = "none";
      document.body.style.cursor = "";
    }
  });

  document.addEventListener("mouseleave", () => {
    cursor.style.display = "none";
    document.body.style.cursor = "";
  });
}
