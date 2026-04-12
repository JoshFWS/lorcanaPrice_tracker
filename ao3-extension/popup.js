import { loadConfig, saveConfig, getLastRun, getSnapshots } from "./lib/config.js";

let config;
let snapshots;

// --- Init ---

document.addEventListener("DOMContentLoaded", async () => {
  config = await loadConfig();
  snapshots = await getSnapshots();

  renderSettings();
  renderWorks();
  renderSearches();
  await updateStatus();

  // Tab switching
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  // Settings toggle
  document.getElementById("settingsToggle").addEventListener("click", () => {
    document.getElementById("settingsPanel").classList.toggle("hidden");
  });

  // Add work
  document.getElementById("addWorkBtn").addEventListener("click", addWork);
  document.getElementById("addWorkUrl").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addWork();
  });

  // New search alert
  document.getElementById("newSearchBtn").addEventListener("click", () => {
    document.getElementById("searchForm").classList.remove("hidden");
    document.getElementById("newSearchBtn").classList.add("hidden");
  });
  document.getElementById("cancelSearchBtn").addEventListener("click", cancelSearch);
  document.getElementById("addSearchBtn").addEventListener("click", addSearch);

  // Category pill toggles
  document.querySelectorAll("#categoryPills .pill-toggle").forEach((pill) => {
    pill.addEventListener("click", () => pill.classList.toggle("active"));
  });

  // Settings
  document.getElementById("saveSettings").addEventListener("click", handleSaveSettings);
  document.getElementById("checksPerHour").addEventListener("input", (e) => {
    document.getElementById("checksPerHourValue").textContent = e.target.value;
  });
  document.getElementById("paranoidMode").addEventListener("change", (e) => {
    document.getElementById("checksPerHourGroup").style.opacity = e.target.checked ? "1" : "0.4";
    document.getElementById("checksPerHourGroup").style.pointerEvents = e.target.checked ? "auto" : "none";
  });

  // Check now
  document.getElementById("checkNow").addEventListener("click", handleCheckNow);

  setupAuthorCursorEffect();
});

function setupAuthorCursorEffect() {
  const link = document.getElementById("authorLink");
  const cursor = document.getElementById("customCursor");
  if (!link || !cursor) return;

  const PROXIMITY_THRESHOLD = 100;

  document.addEventListener("mousemove", (e) => {
    const rect = link.getBoundingClientRect();
    const linkCenterX = rect.left + rect.width / 2;
    const linkCenterY = rect.top + rect.height / 2;
    const dx = e.clientX - linkCenterX;
    const dy = e.clientY - linkCenterY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < PROXIMITY_THRESHOLD) {
      const t = 1 - distance / PROXIMITY_THRESHOLD;
      const scale = 1 + 2 * t;
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

// --- Tab Switching ---

function switchTab(tabName) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
  document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add("active");
  document.getElementById(`tab-${tabName}`).classList.add("active");
}

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
    const snapshot = snapshots.workSnapshots[work.workId] || null;
    const card = document.createElement("div");
    card.className = "card";

    const title = snapshot?.title || work.label || `Work #${work.workId}`;
    const author = snapshot?.author ? `by ${snapshot.author}` : "";
    const updated = snapshot?.updatedDate || snapshot?.publishedDate || "Not checked yet";

    let statsHtml = "";
    if (snapshot) {
      const parts = [];
      if (snapshot.wordCount) parts.push(`${snapshot.wordCount.toLocaleString()} words`);
      if (snapshot.chapters) parts.push(`${snapshot.chapters} ch`);
      if (snapshot.kudos) parts.push(`${snapshot.kudos.toLocaleString()} kudos`);
      const statusPill = snapshot.complete
        ? '<span class="pill pill-green">Complete</span>'
        : '<span class="pill pill-amber">In Progress</span>';
      statsHtml = `<div class="card-stats">${parts.join(" | ")} ${statusPill}</div>`;
    }

    card.innerHTML = `
      <div class="card-header">
        <span class="card-title">${escapeHtml(title)}</span>
        <button class="btn-remove" data-id="${work.id}" title="Remove">&times;</button>
      </div>
      ${author ? `<div class="card-author">${escapeHtml(author)}</div>` : ""}
      <div class="card-meta">Updated: ${escapeHtml(updated)}</div>
      ${statsHtml}`;

    container.appendChild(card);
  }

  // Remove buttons
  container.querySelectorAll(".btn-remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = e.target.dataset.id;
      config.trackedWorks = config.trackedWorks.filter((w) => w.id !== id);
      saveAndRender();
    });
  });
}

// --- Render Searches ---

function renderSearches() {
  const container = document.getElementById("searchList");
  container.innerHTML = "";

  if (config.trackedSearches.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">&#128270;</div>
        <div>No search alerts yet.<br>Create one to get notified about new works.</div>
      </div>`;
    return;
  }

  for (const search of config.trackedSearches) {
    const snapshot = snapshots.searchSnapshots[search.id] || null;
    const card = document.createElement("div");
    card.className = "card";

    const pills = buildFilterPills(search.filters);
    const totalWorks = snapshot ? `${snapshot.totalWorks.toLocaleString()} works` : "Not checked yet";

    card.innerHTML = `
      <div class="card-header">
        <span class="card-title">${escapeHtml(search.name)}</span>
        <button class="btn-remove" data-id="${search.id}" title="Remove">&times;</button>
      </div>
      <div class="card-stats">${pills}</div>
      <div class="card-meta" style="margin-top:6px">Last check: ${escapeHtml(totalWorks)}</div>`;

    container.appendChild(card);
  }

  // Remove buttons
  container.querySelectorAll(".btn-remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = e.target.dataset.id;
      config.trackedSearches = config.trackedSearches.filter((s) => s.id !== id);
      saveAndRender();
    });
  });
}

function buildFilterPills(filters) {
  const pills = [];

  if (filters.categories && filters.categories.length > 0) {
    for (const cat of filters.categories) {
      pills.push(`<span class="pill pill-blue">${escapeHtml(cat)}</span>`);
    }
  }
  if (filters.fandoms) {
    pills.push(`<span class="pill pill-amber">${escapeHtml(filters.fandoms)}</span>`);
  }
  if (filters.relationships) {
    pills.push(`<span class="pill pill-red">${escapeHtml(filters.relationships)}</span>`);
  }
  if (filters.characters) {
    pills.push(`<span class="pill pill-gray">${escapeHtml(filters.characters)}</span>`);
  }
  if (filters.wordCountMin) {
    pills.push(`<span class="pill pill-gray">&gt;${Number(filters.wordCountMin).toLocaleString()} words</span>`);
  }
  if (filters.minKudos) {
    pills.push(`<span class="pill pill-green">&gt;${Number(filters.minKudos).toLocaleString()} kudos</span>`);
  }
  if (filters.minHits) {
    pills.push(`<span class="pill pill-green">&gt;${Number(filters.minHits).toLocaleString()} hits</span>`);
  }
  if (filters.complete) {
    pills.push(`<span class="pill pill-green">Complete</span>`);
  }
  if (filters.language) {
    pills.push(`<span class="pill pill-gray">${escapeHtml(filters.language.toUpperCase())}</span>`);
  }

  return pills.join(" ");
}

// --- Add Work ---

function addWork() {
  const input = document.getElementById("addWorkUrl");
  const url = input.value.trim();

  // Validate AO3 work URL
  const match = url.match(/archiveofourown\.org\/works\/(\d+)/);
  if (!match) {
    showToast("Please enter a valid AO3 work URL", "error");
    return;
  }

  const workId = match[1];

  // Check for duplicate
  if (config.trackedWorks.some((w) => w.workId === workId)) {
    showToast("This work is already being tracked", "error");
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

// --- Add Search ---

function addSearch() {
  const name = document.getElementById("searchName").value.trim();
  if (!name) {
    showToast("Please enter an alert name", "error");
    return;
  }

  const selectedCategories = [
    ...document.querySelectorAll("#categoryPills .pill-toggle.active"),
  ].map((p) => p.dataset.value);

  const filters = {
    categories: selectedCategories,
    fandoms: document.getElementById("searchFandom").value.trim(),
    relationships: document.getElementById("searchRelationship").value.trim(),
    characters: document.getElementById("searchCharacters").value.trim(),
    additionalTags: document.getElementById("searchTags").value.trim(),
    language: document.getElementById("searchLanguage").value,
    wordCountMin: document.getElementById("searchWordsMin").value || null,
    wordCountMax: document.getElementById("searchWordsMax").value || null,
    chaptersMin: document.getElementById("searchChaptersMin").value || null,
    chaptersMax: document.getElementById("searchChaptersMax").value || null,
    minKudos: document.getElementById("searchMinKudos").value || null,
    minHits: document.getElementById("searchMinHits").value || null,
    complete: document.getElementById("searchComplete").checked || null,
    sortBy: "revised_at",
  };

  config.trackedSearches.push({
    id: generateId(),
    name,
    filters,
    addedAt: Date.now(),
  });

  resetSearchForm();
  saveAndRender();
  showToast("Search alert added!", "success");
}

function cancelSearch() {
  resetSearchForm();
}

function resetSearchForm() {
  document.getElementById("searchForm").classList.add("hidden");
  document.getElementById("newSearchBtn").classList.remove("hidden");
  document.getElementById("searchName").value = "";
  document.getElementById("searchFandom").value = "";
  document.getElementById("searchRelationship").value = "";
  document.getElementById("searchCharacters").value = "";
  document.getElementById("searchTags").value = "";
  document.getElementById("searchLanguage").value = "";
  document.getElementById("searchWordsMin").value = "";
  document.getElementById("searchWordsMax").value = "";
  document.getElementById("searchChaptersMin").value = "";
  document.getElementById("searchChaptersMax").value = "";
  document.getElementById("searchMinKudos").value = "";
  document.getElementById("searchMinHits").value = "";
  document.getElementById("searchComplete").checked = false;
  document.querySelectorAll("#categoryPills .pill-toggle").forEach((p) => p.classList.remove("active"));
}

// --- Settings ---

function renderSettings() {
  document.getElementById("webhookUrl").value = config.webhookUrl || "";
  document.getElementById("paranoidMode").checked = config.paranoidMode;
  document.getElementById("checksPerHour").value = config.checksPerHour || 2;
  document.getElementById("checksPerHourValue").textContent = config.checksPerHour || 2;

  // Update checks/hour visibility based on paranoid mode
  const paranoidEnabled = config.paranoidMode;
  document.getElementById("checksPerHourGroup").style.opacity = paranoidEnabled ? "1" : "0.4";
  document.getElementById("checksPerHourGroup").style.pointerEvents = paranoidEnabled ? "auto" : "none";
}

async function handleSaveSettings() {
  config.webhookUrl = document.getElementById("webhookUrl").value.trim();
  config.paranoidMode = document.getElementById("paranoidMode").checked;
  config.checksPerHour = parseInt(document.getElementById("checksPerHour").value) || 2;

  await saveConfig(config);

  // Tell service worker to reschedule alarms
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
    // Reload snapshots to reflect new data
    snapshots = await getSnapshots();
    renderWorks();
    renderSearches();
    showToast("Check complete! See Discord for updates.", "success");
  } catch (e) {
    showToast(`Error: ${e.message}`, "error");
  }

  btn.textContent = "Check Now";
  btn.disabled = false;
  await updateStatus();
}

// --- Status ---

async function updateStatus() {
  const lastRun = await getLastRun();
  const statusText = document.getElementById("statusText");

  if (lastRun) {
    const ago = getTimeAgo(lastRun);
    statusText.textContent = `Last check: ${ago}`;
  } else {
    statusText.textContent = 'No checks run yet. Click "Check Now" to start.';
  }
}

function getTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// --- Helpers ---

async function saveAndRender() {
  await saveConfig(config);
  renderWorks();
  renderSearches();
}

function showToast(text, type) {
  const el = document.getElementById("toast");
  el.textContent = text;
  el.className = `toast ${type}`;
  setTimeout(() => {
    el.className = "toast hidden";
  }, 3000);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
