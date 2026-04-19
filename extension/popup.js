import { loadConfig, saveConfig, getLastRun } from "./lib/config.js";

let config;

document.addEventListener("DOMContentLoaded", async () => {
  config = await loadConfig();
  renderConfig();
  await updateStatus();

  document.getElementById("save").addEventListener("click", handleSave);
  document.getElementById("runNow").addEventListener("click", handleRunNow);
  document.getElementById("addProduct").addEventListener("click", addEmptyProduct);

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

function renderConfig() {
  document.getElementById("webhookUrl").value = config.webhookUrl || "";
  const intervalInput = document.getElementById("scheduleIntervalHours");
  intervalInput.value = config.scheduleIntervalHours ?? 3;
  document.getElementById("time1").value = config.scheduleTimes[0] || "09:00";
  document.getElementById("time2").value = config.scheduleTimes[1] || "21:00";

  // Paranoid mode
  const paranoidCheckbox = document.getElementById("paranoidMode");
  paranoidCheckbox.checked = config.paranoidMode || false;
  document.getElementById("checksPerHour").value = config.checksPerHour || 1;
  updateScheduleUI();

  paranoidCheckbox.addEventListener("change", updateScheduleUI);
  intervalInput.addEventListener("input", updateScheduleUI);

  renderProducts();
}

function updateScheduleUI() {
  const paranoid = document.getElementById("paranoidMode").checked;
  const interval = Number(document.getElementById("scheduleIntervalHours").value) || 0;

  document.getElementById("paranoidOptions").classList.toggle("hidden", !paranoid);

  // Fixed-time row is only used when both paranoid mode is off AND interval is 0
  const fixedTimesActive = !paranoid && interval <= 0;
  const scheduleRow = document.getElementById("scheduleRow");
  scheduleRow.style.opacity = fixedTimesActive ? "1" : "0.4";
  scheduleRow.style.pointerEvents = fixedTimesActive ? "auto" : "none";
}

function renderProducts() {
  const container = document.getElementById("productList");
  container.innerHTML = "";

  for (let i = 0; i < config.products.length; i++) {
    const product = config.products[i];
    const card = document.createElement("div");
    card.className = "product-card";
    card.innerHTML = `
      <div class="product-header">
        <span class="product-name">${product.name || "New Product"}</span>
        <button class="btn-remove" data-index="${i}">&times;</button>
      </div>
      <div class="fields full">
        <div>
          <label>Name</label>
          <input type="text" data-field="name" data-index="${i}" value="${product.name || ""}" />
        </div>
      </div>
      <div class="fields">
        <div>
          <label>Product ID</label>
          <input type="number" data-field="productId" data-index="${i}" value="${product.productId || ""}" />
        </div>
        <div>
          <label>Group ID</label>
          <input type="number" data-field="groupId" data-index="${i}" value="${product.groupId || ""}" />
        </div>
        <div>
          <label>MSRP ($)</label>
          <input type="number" step="0.01" data-field="msrp" data-index="${i}" value="${product.msrp || ""}" />
        </div>
        <div>
          <label>Target Price ($)</label>
          <input type="number" step="0.01" data-field="targetPrice" data-index="${i}" value="${product.targetPrice || ""}" />
        </div>
      </div>
      <div class="fields full">
        <div>
          <label>Search Terms (for Google price search)</label>
          <input type="text" data-field="searchTerms" data-index="${i}" value="${product.searchTerms || ""}" />
        </div>
      </div>
    `;
    container.appendChild(card);
  }

  // Event listeners for remove buttons
  container.querySelectorAll(".btn-remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const idx = parseInt(e.target.dataset.index);
      config.products.splice(idx, 1);
      renderProducts();
    });
  });

  // Event listeners for field changes
  container.querySelectorAll("input[data-field]").forEach((input) => {
    input.addEventListener("change", (e) => {
      const idx = parseInt(e.target.dataset.index);
      const field = e.target.dataset.field;
      let value = e.target.value;

      // Convert numeric fields
      if (["productId", "groupId"].includes(field)) {
        value = value ? parseInt(value) : null;
      } else if (["msrp", "targetPrice"].includes(field)) {
        value = value ? parseFloat(value) : null;
      }

      config.products[idx][field] = value;
    });
  });
}

function addEmptyProduct() {
  config.products.push({
    name: "",
    productId: null,
    groupId: null,
    variant: "Normal",
    msrp: null,
    targetPrice: null,
    alertThresholdPct: 0.8,
    searchTerms: "",
  });
  renderProducts();
}

async function handleSave() {
  // Read current values from UI
  config.webhookUrl = document.getElementById("webhookUrl").value.trim();
  config.scheduleIntervalHours =
    parseInt(document.getElementById("scheduleIntervalHours").value) || 0;
  config.scheduleTimes = [
    document.getElementById("time1").value,
    document.getElementById("time2").value,
  ];
  config.paranoidMode = document.getElementById("paranoidMode").checked;
  config.checksPerHour = parseInt(document.getElementById("checksPerHour").value) || 1;

  await saveConfig(config);
  showMessage("Settings saved!", "success");
}

async function handleRunNow() {
  const btn = document.getElementById("runNow");
  btn.textContent = "Running...";
  btn.disabled = true;

  try {
    await chrome.runtime.sendMessage({ type: "RUN_NOW" });
    showMessage("Price check complete! Check Discord.", "success");
  } catch (e) {
    showMessage(`Error: ${e.message}`, "error");
  }

  btn.textContent = "Run Now";
  btn.disabled = false;
  await updateStatus();
}

async function updateStatus() {
  const lastRun = await getLastRun();
  const statusText = document.getElementById("statusText");

  if (lastRun) {
    const date = new Date(lastRun);
    statusText.textContent = `Last check: ${date.toLocaleString()}`;
  } else {
    statusText.textContent = "No checks run yet. Click 'Run Now' to test.";
  }
}

function showMessage(text, type) {
  const el = document.getElementById("message");
  el.textContent = text;
  el.className = `message ${type}`;
  setTimeout(() => {
    el.className = "message hidden";
  }, 3000);
}
