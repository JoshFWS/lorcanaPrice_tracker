import { loadConfig, saveConfig, getLastRun } from "./lib/config.js";

let config;

document.addEventListener("DOMContentLoaded", async () => {
  config = await loadConfig();
  renderConfig();
  await updateStatus();

  document.getElementById("save").addEventListener("click", handleSave);
  document.getElementById("runNow").addEventListener("click", handleRunNow);
  document.getElementById("addProduct").addEventListener("click", addEmptyProduct);
});

function renderConfig() {
  document.getElementById("webhookUrl").value = config.webhookUrl || "";
  document.getElementById("time1").value = config.scheduleTimes[0] || "09:00";
  document.getElementById("time2").value = config.scheduleTimes[1] || "21:00";

  // Paranoid mode
  const paranoidCheckbox = document.getElementById("paranoidMode");
  paranoidCheckbox.checked = config.paranoidMode || false;
  document.getElementById("checksPerHour").value = config.checksPerHour || 1;
  updateParanoidUI(paranoidCheckbox.checked);

  paranoidCheckbox.addEventListener("change", (e) => {
    updateParanoidUI(e.target.checked);
  });

  renderProducts();
}

function updateParanoidUI(enabled) {
  document.getElementById("paranoidOptions").classList.toggle("hidden", !enabled);
  // Dim the fixed schedule when paranoid mode is on (it won't be used)
  document.getElementById("scheduleRow").style.opacity = enabled ? "0.4" : "1";
  document.getElementById("scheduleRow").style.pointerEvents = enabled ? "none" : "auto";
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
