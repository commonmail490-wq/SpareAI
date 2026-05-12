/**
 * SpareAI dashboard — vanilla JS, Chart.js v4
 */
const PALETTE = [
  "#5B9CF6",
  "#F9A26C",
  "#6ECFB5",
  "#F06B8A",
  "#A78BFA",
  "#FACC60",
  "#38BDF8",
  "#FB923C",
];

if (
  typeof Chart !== "undefined" &&
  Chart.register &&
  Array.isArray(Chart.registerables)
) {
  Chart.register(...Chart.registerables);
}
const zoomPluginGlobal = typeof zoomPlugin !== "undefined" ? zoomPlugin : window.ChartZoom;
if (typeof Chart !== "undefined" && zoomPluginGlobal) {
  Chart.register(zoomPluginGlobal);
}

const API_BASE = "";
const PAGE_SIZE = 25;
const loaded = {};
const CHART_INSTANCE_KEYS = [
  "sparkChartInstance",
  "stockLevelsChartInstance",
  "categoryChartInstance",
  "deptChartInstance",
  "trendChartInstance",
  "cumulativeChartInstance",
  "compareChartInstance",
  "historicalChartInstance",
  "forecastChartInstance",
];

function isDarkMode() {
  return document.body.classList.contains("dark-mode");
}

function chartUiColors() {
  return isDarkMode()
    ? { text: "#c8d6ea", grid: "rgba(136, 153, 187, 0.22)" }
    : { text: "#5a6b7c", grid: "rgba(0, 0, 0, 0.06)" };
}

function applyChartJsThemeDefaults() {
  if (typeof Chart === "undefined") return;
  const colors = chartUiColors();
  Chart.defaults.color = colors.text;
  Chart.defaults.borderColor = colors.grid;
  if (Chart.defaults.plugins?.legend?.labels) {
    Chart.defaults.plugins.legend.labels.color = colors.text;
  }
}

function applyThemeToChart(chart) {
  if (!chart) return;
  const colors = chartUiColors();
  if (chart.options?.plugins?.legend?.labels) {
    chart.options.plugins.legend.labels.color = colors.text;
  }
  for (const axis of ["x", "y"]) {
    const scale = chart.options?.scales?.[axis];
    if (!scale) continue;
    if (scale.ticks) scale.ticks.color = colors.text;
    if (scale.grid) scale.grid.color = colors.grid;
  }
  chart.update("none");
}

function refreshChartTheme() {
  applyChartJsThemeDefaults();
  for (const key of CHART_INSTANCE_KEYS) {
    applyThemeToChart(window[key]);
  }
}

function syncThemeToggleButton() {
  const toggleBtn = document.getElementById("theme-toggle");
  if (!toggleBtn) return;
  toggleBtn.textContent = isDarkMode() ? "☀" : "🌙";
}

function applySavedTheme() {
  try {
    if (localStorage.getItem("spareai-theme") === "dark") {
      document.body.classList.add("dark-mode");
    }
  } catch {
    /* ignore storage errors */
  }
  applyChartJsThemeDefaults();
  syncThemeToggleButton();
}

applySavedTheme();

let currentHorizon = 30;
let bandVisible = true;
let trendRange = "30";
let categoryMode = "value";
let criticalTab = "all";
let materialNameByCode = new Map();
let consumptionRateByCode = new Map();
let inventoryPage = 1;
let inventorySort = { key: "materialCode", dir: "asc" };
window.stockTopN = 20;

window.inventoryData = [];
window.criticalData = [];

function ctxPath() {
  return typeof window.CONTEXT_PATH === "string" ? window.CONTEXT_PATH : "";
}

async function apiFetch(path) {
  const base = ctxPath();
  const url = `${base}${path.startsWith("/") ? path : "/" + path}`;
  const res = await fetch(url);
  let body = {};
  try {
    body = await res.json();
  } catch {
    body = {};
  }
  if (!res.ok) {
    const msg =
      body.error?.message || body.message || res.statusText || "Request failed";
    throw new Error(msg);
  }
  if (body.success === false) {
    const msg = body.error?.message || body.message || "API error";
    throw new Error(msg);
  }
  return body.data !== undefined ? body.data : body;
}

async function api(path) {
  const data = await apiFetch(path);
  if (Array.isArray(data)) {
    console.log(`[SpareAI] ${path} →`, `${data.length} records`);
  } else if (data && Array.isArray(data.items)) {
    console.log(`[SpareAI] ${path} →`, `${data.items.length} records`);
  } else if (data && Array.isArray(data.records)) {
    console.log(`[SpareAI] ${path} →`, `${data.records.length} records`);
  } else if (data && Array.isArray(data.critical)) {
    console.log(`[SpareAI] ${path} →`, `${data.critical.length} records`);
  } else {
    console.log(`[SpareAI] ${path} →`, data);
  }
  return data;
}

function paletteColors(count) {
  return Array.from({ length: count }, (_, i) => PALETTE[i % PALETTE.length]);
}

function getSectionEl(sectionId) {
  return document.getElementById(sectionId);
}

function showLoading(sectionId) {
  const section = getSectionEl(sectionId);
  if (!section) return;
  section.querySelectorAll(".section-loading-overlay").forEach((n) => n.remove());
  const overlay = document.createElement("div");
  overlay.className = "section-loading-overlay";
  overlay.innerHTML = '<div class="spinner" aria-hidden="true"></div>';
  section.appendChild(overlay);
}

function hideLoading(sectionId) {
  const section = getSectionEl(sectionId);
  if (!section) return;
  section.querySelectorAll(".section-loading-overlay").forEach((n) => n.remove());
}

function showError(sectionId, msg) {
  const section = getSectionEl(sectionId);
  if (!section) return;
  section.querySelectorAll(".section-error-banner").forEach((n) => n.remove());
  const banner = document.createElement("div");
  banner.className = "section-error-banner";
  banner.textContent = msg;
  section.insertBefore(banner, section.firstChild.nextSibling);
}

function clearError(sectionId) {
  const section = getSectionEl(sectionId);
  if (!section) return;
  section.querySelectorAll(".section-error-banner").forEach((n) => n.remove());
}

function showChartLoading(stateId) {
  const state = document.getElementById(stateId);
  if (!state) return;
  state.innerHTML =
    '<div class="section-loading-overlay"><div class="spinner" aria-hidden="true"></div></div>';
}

function showChartError(stateId, msg) {
  const state = document.getElementById(stateId);
  if (!state) return;
  state.innerHTML = `<div class="section-error-banner">${escapeHtml(msg)}</div>`;
}

function showChartEmpty(stateId, msg) {
  const state = document.getElementById(stateId);
  if (!state) return;
  state.innerHTML = `<div class="empty-state">${escapeHtml(msg)}</div>`;
}

function clearChartState(stateId) {
  const state = document.getElementById(stateId);
  if (state) state.innerHTML = "";
}

function showWarning(sectionId, msg) {
  const el = document.getElementById(sectionId);
  if (!el) return;
  el.hidden = false;
  el.textContent = msg;
}

function formatNumber(n, fracDigits = 2) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: fracDigits,
    maximumFractionDigits: fracDigits,
  });
}

function formatDate(ds) {
  if (!ds) return "";
  const d = new Date(ds);
  if (Number.isNaN(d.getTime())) return String(ds);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function stockValue(item) {
  const q = Number(item.stockQty ?? item.stock_qty ?? 0);
  const c = Number(item.unitCost ?? item.unit_cost ?? 0);
  return q * c;
}

function itemDepartment(item) {
  return item.department ?? item.location ?? "";
}

function inventoryStatus(item) {
  const stock = Number(item.stockQty ?? item.stock_qty ?? 0);
  const reorder = Number(item.reorderLevel ?? item.reorder_level ?? 0);
  if (reorder > 0 && stock <= reorder * 0.5) return "CRITICAL";
  if (reorder > 0 && stock <= reorder) return "LOW";
  return "OK";
}

function deriveStatus(item) {
  const status = inventoryStatus(item);
  return status === "OK" ? "LOW" : status;
}

function setKpiValue(id, text) {
  const node = document.getElementById(id);
  if (!node) return;
  const span = node.querySelector(".kpi-value");
  if (span) span.textContent = text;
  else node.textContent = text;
}

function escapeHtml(s) {
  if (s == null) return "";
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function normalizeInventoryItems(data) {
  return data.items ?? data ?? [];
}

function unwrapCritical(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.critical)) return data.critical;
  return [];
}

function detectRateKey(items) {
  return (
    [
      "consumptionRate",
      "consumption_rate",
      "avgConsumption",
      "avg_consumption",
      "monthlyConsumption",
      "rate",
      "consumption",
    ].find((k) => items[0] && items[0][k] !== undefined && items[0][k] !== null) || null
  );
}

function detectNameKey(item) {
  if (!item) return null;
  return (
    [
      "itemName",
      "materialDescription",
      "description",
      "name",
      "material_description",
      "materialName",
    ].find((k) => item[k]) || null
  );
}

function detectCriticalKey(rows, candidates) {
  const sample = rows[0] || {};
  return candidates.find((k) => sample[k] !== undefined && sample[k] !== null) || null;
}

function itemRate(item, rateKey, rateByCode) {
  if (rateKey && item[rateKey] != null) return Number(item[rateKey]) || 0;
  const code = item.materialCode ?? item.material_code;
  return rateByCode.get(code) ?? 0;
}

function fillSelectOptions(select, items, includeBlank) {
  if (!select) return;
  const current = select.value;
  select.innerHTML = includeBlank ? '<option value="">— select —</option>' : "";
  for (const it of items) {
    const code = it.materialCode ?? it.material_code ?? "";
    if (!code) continue;
    const name = it.itemName ?? it.item_name ?? "";
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = `${code} — ${name}`.length > 60 ? code : `${code} — ${name}`;
    select.appendChild(opt);
  }
  if (current && [...select.options].some((o) => o.value === current)) {
    select.value = current;
  }
}

function populateMaterialSelects(items) {
  materialNameByCode.clear();
  for (const it of items) {
    const code = it.materialCode ?? it.material_code ?? "";
    if (code) materialNameByCode.set(code, it.itemName ?? it.item_name ?? "");
  }
  const selects = [
    "forecast-material-select",
    "trend-material-select",
    "compare-a",
    "compare-b",
    "compare-c",
  ];
  for (const id of selects) {
    fillSelectOptions(document.getElementById(id), items, true);
  }
}

const VALID_PAGES = ["overview", "charts", "inventory", "critical", "forecast"];

function resolvePage(page) {
  return VALID_PAGES.includes(page) ? page : "overview";
}

function navigateTo(page) {
  page = resolvePage(page);
  document.querySelectorAll(".page-section").forEach((s) => s.classList.remove("active"));
  const section = document.getElementById(`page-${page}`);
  if (section) {
    section.classList.add("active");
  }
  document
    .querySelectorAll(".nav-item, .nav-hash")
    .forEach((el) => el.classList.toggle("active", el.dataset.page === page));
  if (window.location.hash.slice(1) !== page) {
    window.location.hash = page;
  }
  if (!loaded[page]) {
    loadPage(page);
    loaded[page] = true;
  }
  document.body.classList.remove("sidebar-open");
}

function loadPage(page) {
  switch (page) {
    case "overview":
      loadOverviewPage();
      break;
    case "charts":
      loadChartsPage();
      break;
    case "inventory":
      loadInventoryTable();
      break;
    case "critical":
      loadCriticalTable();
      break;
    case "forecast":
      initForecastPage();
      break;
    default:
      break;
  }
}

async function loadOverviewPage() {
  const sid = "page-overview";
  clearError(sid);
  showLoading(sid);
  try {
    const [summary, listData, lowStock, criticalForecast, history] = await Promise.all([
      api("/api/inventory/summary"),
      api("/api/inventory/list"),
      api("/api/inventory/low-stock"),
      api("/api/forecast/critical"),
      api("/api/consumption/history"),
    ]);

    console.log("[FIX DEBUG] /api/inventory/list → raw:", JSON.stringify(listData, null, 2));
    console.log("[FIX DEBUG] /api/inventory/summary → raw:", JSON.stringify(summary, null, 2));
    console.log("[FIX DEBUG] /api/forecast/critical → raw:", JSON.stringify(criticalForecast, null, 2));

    const items = normalizeInventoryItems(listData);
    window.inventoryData = items;
    populateMaterialSelects(items);

    const departments = new Set(items.map((it) => itemDepartment(it)).filter(Boolean));
    const zeroStock = items.filter((it) => Number(it.stockQty ?? it.stock_qty ?? 0) === 0).length;
    const criticalRows = unwrapCritical(criticalForecast);
    consumptionRateByCode.clear();
    for (const row of criticalRows) {
      const code = row.material_code ?? row.materialCode;
      if (code) {
        consumptionRateByCode.set(
          code,
          Number(row.avg_daily_consumption ?? row.avgDailyConsumption ?? 0)
        );
      }
    }

    console.log("[O1] inventory item keys:", items[0] ? Object.keys(items[0]) : "empty");
    const rateKey = detectRateKey(items);
    console.log("[O1] detected rateKey:", rateKey);
    const nameKey = detectNameKey(items[0]);
    const fastestEl = document.getElementById("qk-fastest");
    const slowestEl = document.getElementById("qk-slowest");
    const ranked = [...items].sort(
      (a, b) => itemRate(b, rateKey, consumptionRateByCode) - itemRate(a, rateKey, consumptionRateByCode)
    );
    if (ranked.length && (rateKey || consumptionRateByCode.size)) {
      const fastest = ranked[0];
      const slowest =
        [...ranked].filter((i) => itemRate(i, rateKey, consumptionRateByCode) > 0).pop() ||
        ranked[ranked.length - 1];
      if (fastestEl) {
        fastestEl.textContent = fastest
          ? `${fastest[nameKey] || fastest.materialCode || fastest.material_code || "—"}`
          : "—";
      }
      if (slowestEl) {
        slowestEl.textContent = slowest
          ? `${slowest[nameKey] || slowest.materialCode || slowest.material_code || "—"}`
          : "—";
      }
    } else {
      console.warn("[O1] No consumption rate key found in inventory data");
      if (fastestEl) fastestEl.textContent = "N/A";
      if (slowestEl) slowestEl.textContent = "N/A";
    }

    setKpiValue("kpi-total-materials", formatNumber(summary.total_skus ?? summary.totalMaterials ?? items.length, 0));
    setKpiValue("kpi-total-departments", formatNumber(departments.size, 0));
    setKpiValue("kpi-total-value", formatNumber(summary.total_stock_value ?? summary.totalStockValue ?? 0, 2));
    setKpiValue("kpi-critical", formatNumber(summary.critical_items ?? summary.criticalCount ?? 0, 0));
    setKpiValue("kpi-zero-stock", formatNumber(zeroStock, 0));

    try {
      const dtzKey = detectCriticalKey(criticalRows, [
        "daysToZero",
        "days_to_zero",
        "days_to_zero_estimate",
        "daystozero",
        "days",
        "eta",
      ]);
      const shortageCount = dtzKey
        ? criticalRows.filter((row) => Number(row[dtzKey]) <= 30).length
        : criticalRows.length;
      setKpiValue("kpi-forecast-shortages", formatNumber(shortageCount, 0));
      console.log("[O5] forecasted shortages:", shortageCount, "dtzKey:", dtzKey);
    } catch (e) {
      setKpiValue("kpi-forecast-shortages", "—");
    }

    document.getElementById("qk-reorder").textContent = formatNumber(
      summary.low_stock_count ?? summary.lowStockCount ?? (lowStock.critical ?? lowStock.items ?? []).length,
      0
    );

    renderTopConsumedTable(items, rateKey, nameKey);
    renderTopStockoutTable(criticalRows);

    const lowItems = lowStock.critical ?? lowStock.items ?? [];
    const overstock = items.filter((it) => {
      const stock = Number(it.stockQty ?? it.stock_qty ?? 0);
      const reorder = Number(it.reorderLevel ?? it.reorder_level ?? 0);
      return reorder > 0 && stock > reorder * 3;
    });
    const alerts = document.getElementById("overview-alerts");
    if (alerts) {
      const parts = [];
      if (lowItems.length) {
        parts.push(
          `<div class="alert-banner critical low-stock-tile">🔴 Low stock warnings: ${lowItems.length} <a href="#critical" class="nav-hash" data-page="critical">View Critical</a></div>`
        );
      }
      if (overstock.length) {
        parts.push(
          `<div class="alert-banner warning overstock-tile">🟠 Overstock warnings: ${overstock.length} items above 3× reorder level</div>`
        );
      }
      if (parts.length) {
        alerts.hidden = false;
        alerts.innerHTML = parts.join("");
      } else {
        alerts.hidden = true;
        alerts.innerHTML = "";
      }
    }

    document.getElementById("status-refreshed").textContent = `Last refreshed: ${new Date().toLocaleString()}`;
    document.getElementById("status-records").textContent = `Total records loaded: ${items.length}`;
    const prophetDot = document.getElementById("prophet-dot");
    const prophetLabel = document.getElementById("prophet-label");
    prophetDot.className = "status-dot ok";
    prophetLabel.textContent = "Prophet OK";

    updateMonthlyConsumption(summary, items, history, rateKey);
  } catch (e) {
    showError(sid, e.message || "Failed to load overview");
    const prophetDot = document.getElementById("prophet-dot");
    const prophetLabel = document.getElementById("prophet-label");
    if (prophetDot) prophetDot.className = "status-dot bad";
    if (prophetLabel) prophetLabel.textContent = "Prophet Offline";
  } finally {
    hideLoading(sid);
  }
}

function renderTopConsumedTable(items, rateKey, nameKey) {
  const tbody = document.querySelector("#insight-top-consumed tbody");
  if (!tbody) return;
  if (!items || !items.length) {
    tbody.innerHTML =
      '<tr><td colspan="3" class="loading-row">No data returned. Check backend connection.</td></tr>';
    return;
  }
  const sortKey = rateKey || "materialCode";
  const top5 = [...items]
    .sort((a, b) => itemRate(b, rateKey, consumptionRateByCode) - itemRate(a, rateKey, consumptionRateByCode))
    .slice(0, 5);
  const resolvedNameKey = nameKey || detectNameKey(top5[0]);
  tbody.innerHTML = top5
    .map((item) => {
      const code = item.materialCode ?? item.material_code ?? "—";
      const name = resolvedNameKey ? item[resolvedNameKey] : item.itemName ?? item.item_name ?? "—";
      const value = itemRate(item, rateKey, consumptionRateByCode);
      return `<tr><td>${escapeHtml(code)}</td><td>${escapeHtml(name || "—")}</td><td>${Number(value).toLocaleString("en-IN")}</td></tr>`;
    })
    .join("");
}

function renderTopStockoutTable(criticalRows) {
  const tbody = document.querySelector("#insight-stockout tbody");
  if (!tbody) return;
  try {
    console.log("[O4] forecast/critical raw:", JSON.stringify(criticalRows, null, 2));
    console.log("[O4] first item keys:", criticalRows[0] ? Object.keys(criticalRows[0]) : "empty");
    if (!criticalRows.length) {
      tbody.innerHTML =
        '<tr><td colspan="3" class="loading-row">No data returned. Check backend connection.</td></tr>';
      return;
    }
    const dtzKey = detectCriticalKey(criticalRows, [
      "daysToZero",
      "days_to_zero",
      "days_to_zero_estimate",
      "daystozero",
      "days",
      "eta",
    ]);
    const codeKey = detectCriticalKey(criticalRows, ["materialCode", "material_code", "code", "id"]);
    const nameKey2 = detectCriticalKey(criticalRows, [
      "materialDescription",
      "description",
      "name",
      "materialName",
      "material_description",
      "itemName",
      "item_name",
    ]);
    console.log("[O4] dtzKey:", dtzKey, "codeKey:", codeKey);
    const top5stockout = [...criticalRows]
      .filter((row) => dtzKey && row[dtzKey] !== null && row[dtzKey] !== undefined)
      .sort((a, b) => (Number(a[dtzKey]) || 999) - (Number(b[dtzKey]) || 999))
      .slice(0, 5);
    if (!top5stockout.length) {
      tbody.innerHTML =
        '<tr><td colspan="3" class="loading-row">No data returned. Check backend connection.</td></tr>';
      return;
    }
    tbody.innerHTML = top5stockout
      .map((row) => {
        const code = row[codeKey] ?? "—";
        const name = nameKey2 ? row[nameKey2] : "—";
        const days =
          dtzKey && row[dtzKey] != null ? `${Math.round(Number(row[dtzKey]))} days` : "—";
        return `<tr><td>${escapeHtml(code)}</td><td>${escapeHtml(name || "—")}</td><td style="color:var(--alert-red)">${escapeHtml(days)}</td></tr>`;
      })
      .join("");
  } catch (e) {
    console.error("[O4] forecast/critical failed:", e);
    tbody.innerHTML = '<tr><td colspan="3">Forecast service unavailable</td></tr>';
  }
}

function renderInsightTable(tableId, rows) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = '<tr><td class="loading-row">No data returned. Check backend connection.</td></tr>';
    return;
  }
  tbody.innerHTML = rows
    .map(([code, value]) => `<tr><td>${escapeHtml(code)}</td><td>${escapeHtml(value)}</td></tr>`)
    .join("");
}

function updateMonthlyConsumption(summary, items, history, rateKey) {
  console.log("[O2] summary keys:", Object.keys(summary || {}));
  console.log("[O2] summary values:", summary);
  console.log("[MONTHLY] raw consumption data:", history);
  const monthlyEl = document.getElementById("kpi-monthly");
  const monthlyValue =
    summary.monthlyConsumption ??
    summary.monthly_consumption ??
    summary.totalConsumption ??
    summary.total_consumption ??
    summary.consumption ??
    null;
  if (monthlyEl) {
    if (monthlyValue !== null && monthlyValue !== undefined) {
      monthlyEl.textContent = Number(monthlyValue).toLocaleString("en-IN");
    } else if (rateKey && items.length) {
      const total = items.reduce((sum, item) => sum + (Number(item[rateKey]) || 0), 0);
      monthlyEl.textContent = total > 0 ? total.toLocaleString("en-IN") : "N/A";
      console.log("[O2] fallback monthly sum:", total, "using key:", rateKey);
    } else {
      const total = items.reduce(
        (sum, item) => sum + itemRate(item, rateKey, consumptionRateByCode),
        0
      );
      monthlyEl.textContent = total > 0 ? total.toLocaleString("en-IN") : "N/A";
      console.log("[O2] fallback monthly sum from rates:", total);
    }
  }
  renderSparkline(history);
}

function renderSparkline(history) {
  const canvas = document.getElementById("spark-monthly");
  if (!canvas || typeof Chart === "undefined") return;
  const records = history.records ?? history ?? [];
  const totals = new Map();
  for (const row of records) {
    const date = row.consumptionDate ?? row.consumption_date;
    if (!date) continue;
    const key = String(date).slice(0, 7);
    totals.set(key, (totals.get(key) || 0) + Number(row.consumedQty ?? row.consumed_qty ?? 0));
  }
  const labels = [...totals.keys()].sort();
  const data = labels.map((k) => totals.get(k));
  if (window.sparkChartInstance) window.sparkChartInstance.destroy();
  window.sparkChartInstance = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          data,
          borderColor: PALETTE[0],
          backgroundColor: "rgba(91,156,246,0.15)",
          fill: true,
          tension: 0.3,
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { display: false }, y: { display: false } },
    },
  });
}

function normalizeDepartmentConsumption(raw) {
  console.log("[SpareAI] department-consumption RAW:", JSON.stringify(raw));
  let labels = [];
  let data = [];
  if (Array.isArray(raw)) {
    labels = raw.map(
      (r) => r.department || r.dept || r.label || r.name || Object.values(r)[0]
    );
    data = raw.map(
      (r) => Number(r.value || r.total || r.consumption || Object.values(r)[1] || 0)
    );
  } else if (raw && raw.labels && raw.datasets) {
    const totals = new Map();
    for (const ds of raw.datasets) {
      const dept = ds.label || "Unknown";
      const sum = (ds.data || []).reduce((acc, v) => acc + Number(v || 0), 0);
      totals.set(dept, (totals.get(dept) || 0) + sum);
    }
    labels = [...totals.keys()];
    data = labels.map((label) => totals.get(label));
  } else if (raw && typeof raw === "object") {
    labels = Object.keys(raw);
    data = Object.values(raw).map((v) => Number(v));
  }
  return { labels, data };
}

async function loadStockLevelsChart() {
  showChartLoading("stock-chart-state");
  try {
    const [chartData, invData] = await Promise.all([
      api("/api/charts/stock-levels"),
      api("/api/inventory/list"),
    ]);
    const items = normalizeInventoryItems(invData);
    const categoryFilter = document.getElementById("stock-category-filter")?.value || "";
    const topN = document.getElementById("stock-topn")?.value || String(window.stockTopN || 20);
    const reorderByCode = new Map(
      items.map((it) => [String(it.materialCode ?? it.material_code), Number(it.reorderLevel ?? it.reorder_level ?? 0)])
    );
    const categoryByCode = new Map(
      items.map((it) => [String(it.materialCode ?? it.material_code), it.category ?? ""])
    );

    let labels = [...(chartData.labels || [])];
    let barData = [...(chartData.datasets?.[0]?.data || [])];
    const pairs = labels.map((label, i) => ({
      label: String(label),
      value: Number(barData[i] ?? 0),
      category: categoryByCode.get(String(label)) || "",
      reorder: reorderByCode.get(String(label)) ?? 0,
    }));
    let filtered = pairs.sort((a, b) => b.value - a.value);
    if (categoryFilter) filtered = filtered.filter((p) => p.category === categoryFilter);
    if (topN !== "all") filtered = filtered.slice(0, Number(topN));
    labels = filtered.map((p) => p.label);
    barData = filtered.map((p) => p.value);
    const reorderLine = filtered.map((p) => p.reorder);

    const canvas = document.getElementById("chart-stock-levels");
    if (!canvas) return;
    if (window.stockLevelsChartInstance) window.stockLevelsChartInstance.destroy();
    window.stockLevelsChartInstance = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            type: "bar",
            label: chartData.datasets?.[0]?.label || "Stock Qty",
            data: barData,
            backgroundColor: paletteColors(labels.length),
            borderWidth: 1,
            order: 2,
          },
          {
            type: "line",
            label: "Reorder level",
            data: reorderLine,
            borderColor: "#E53935",
            backgroundColor: "transparent",
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.2,
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        scales: {
          x: {
            ticks: {
              maxRotation: 45,
              minRotation: 45,
              font: { size: 10 },
              autoSkip: true,
              maxTicksLimit: 24,
              callback(val) {
                const label = String(this.getLabelForValue(val));
                return label.length > 12 ? label.slice(-8) : label;
              },
            },
          },
          y: { beginAtZero: true },
        },
        plugins: { legend: { position: "bottom" } },
      },
    });
    clearChartState("stock-chart-state");
  } catch (e) {
    showChartError("stock-chart-state", e.message || "Failed to load stock levels chart");
  }
}

async function loadCategoryChart() {
  showChartLoading("category-chart-state");
  try {
    const [chartData, invData] = await Promise.all([
      api("/api/charts/category-distribution"),
      api("/api/inventory/list"),
    ]);
    let labels = [];
    let data = [];
    if (categoryMode === "count") {
      const counts = new Map();
      for (const it of normalizeInventoryItems(invData)) {
        const cat = it.category || "Unknown";
        counts.set(cat, (counts.get(cat) || 0) + 1);
      }
      labels = [...counts.keys()];
      data = labels.map((k) => counts.get(k));
    } else {
      labels = chartData.labels || [];
      data = (chartData.datasets?.[0]?.data || []).map((v) => Number(v));
    }
    const canvas = document.getElementById("chart-category");
    if (!canvas) return;
    if (window.categoryChartInstance) window.categoryChartInstance.destroy();
    window.categoryChartInstance = new Chart(canvas.getContext("2d"), {
      type: "doughnut",
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: paletteColors(labels.length),
            borderColor: isDarkMode() ? "#151f30" : "#ffffff",
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "right",
            labels: {
              boxWidth: 14,
              padding: 10,
              font: { size: 11 },
              generateLabels(chart) {
                const original = Chart.overrides.doughnut.plugins.legend.labels.generateLabels(chart);
                return original.map((label) => ({
                  ...label,
                  text: label.text.length > 22 ? `${label.text.slice(0, 20)}…` : label.text,
                }));
              },
            },
          },
          tooltip: {
            callbacks: {
              label(ctx) {
                const total = ctx.dataset.data.reduce((a, b) => a + Number(b), 0);
                const value = Number(ctx.raw);
                const pct = total ? ((value / total) * 100).toFixed(1) : "0.0";
                return `${ctx.label}: ${formatNumber(value, 2)} (${pct}%)`;
              },
            },
          },
        },
      },
    });
    clearChartState("category-chart-state");
  } catch (e) {
    showChartError("category-chart-state", e.message || "Failed to load category chart");
  }
}

async function loadDeptChart() {
  const section = document.getElementById("dept-chart-section");
  if (section) section.style.display = "";
  showChartLoading("dept-chart-state");
  try {
    const raw = await api("/api/charts/department-consumption");
    console.log("[DEPT] typeof raw:", typeof raw);
    console.log("[DEPT] Array.isArray:", Array.isArray(raw));
    console.log("[DEPT] raw:", JSON.stringify(raw, null, 2));
    if (Array.isArray(raw)) {
      console.log("[DEPT] first item keys:", raw[0] ? Object.keys(raw[0]) : "empty array");
    } else if (raw && typeof raw === "object") {
      console.log("[DEPT] object keys:", Object.keys(raw));
    }

    let labels = [];
    let data = [];

    if (Array.isArray(raw) && raw.length > 0) {
      const first = raw[0];
      const keys = Object.keys(first);
      const labelKey = keys.find((k) => typeof first[k] === "string") || keys[0];
      const valueKey = keys.find((k) => typeof first[k] === "number") || keys[1];
      console.log("[DEPT] using labelKey:", labelKey, "valueKey:", valueKey);
      labels = raw.map((r) => r[labelKey]);
      data = raw.map((r) => Number(r[valueKey]) || 0);
    } else if (!Array.isArray(raw) && raw?.labels && raw?.datasets) {
      if (raw.datasets.length > 1) {
        const totals = new Map();
        for (const ds of raw.datasets) {
          const dept = ds.label || "Unknown";
          const sum = (ds.data || []).reduce((acc, v) => acc + Number(v || 0), 0);
          totals.set(dept, (totals.get(dept) || 0) + sum);
        }
        labels = [...totals.keys()];
        data = labels.map((label) => totals.get(label));
      } else {
        labels = raw.labels;
        data = (raw.datasets[0]?.data || []).map((v) => Number(v) || 0);
      }
    } else if (!Array.isArray(raw) && raw && typeof raw === "object") {
      labels = Object.keys(raw);
      data = Object.values(raw).map((v) => Number(v) || 0);
    }

    if (!labels.length || !data.length) {
      console.warn("[DEPT] Could not parse department data. Hiding section.");
      if (section) section.style.display = "none";
      clearChartState("dept-chart-state");
      return;
    }

    console.log("[SpareAI] dept chart → labels:", labels, "data:", data);
    const canvas = document.getElementById("chart-dept");
    if (!canvas) return;
    if (window.deptChartInstance) window.deptChartInstance.destroy();
    window.deptChartInstance = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Consumption",
            data,
            backgroundColor: labels.map((_, i) => PALETTE[i % PALETTE.length]),
            borderRadius: 4,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true } },
      },
    });
    clearChartState("dept-chart-state");
  } catch (err) {
    console.error("[DEPT] fetch failed:", err);
    if (section) section.style.display = "none";
    clearChartState("dept-chart-state");
  }
}

function filterTrendSeries(chartData, range, fromDate, toDate) {
  const labels = chartData.labels || [];
  const values = chartData.datasets?.[0]?.data || [];
  const pairs = labels.map((label, i) => ({
    label: String(label),
    value: Number(values[i] ?? 0),
    date: new Date(String(label).length === 7 ? `${label}-01` : label),
  }));
  if (range === "custom" && fromDate && toDate) {
    const from = new Date(fromDate);
    const to = new Date(toDate);
    const filtered = pairs.filter((p) => p.date >= from && p.date <= to);
    return {
      labels: filtered.map((p) => p.label),
      data: filtered.map((p) => p.value),
    };
  }
  const days = Number(range) || 30;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const filtered = pairs.filter((p) => !Number.isNaN(p.date.getTime()) && p.date >= cutoff);
  const use = filtered.length ? filtered : pairs;
  return { labels: use.map((p) => p.label), data: use.map((p) => p.value) };
}

async function loadTrendChart() {
  const code = document.getElementById("trend-material-select")?.value;
  showChartLoading("trend-chart-state");
  if (!code) {
    showChartEmpty("trend-chart-state", "Select a material to view consumption trend.");
    return;
  }
  try {
    const chartData = await api(`/api/charts/consumption-trend/${encodeURIComponent(code)}`);
    const fromDate = document.getElementById("range-from")?.value;
    const toDate = document.getElementById("range-to")?.value;
    const { labels, data } = filterTrendSeries(chartData, trendRange, fromDate, toDate);
    const canvas = document.getElementById("chart-trend");
    if (!canvas) return;
    if (window.trendChartInstance) window.trendChartInstance.destroy();
    window.trendChartInstance = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Consumption",
            data,
            borderColor: PALETTE[0],
            backgroundColor: "transparent",
            tension: 0.25,
            pointRadius: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true } },
        plugins: { legend: { display: false } },
      },
    });
    clearChartState("trend-chart-state");
    loadCumulativeChart(labels, data);
  } catch (e) {
    showChartError("trend-chart-state", e.message || "Failed to load consumption trend");
  }
}

function loadCumulativeChart(labels, data) {
  const canvas = document.getElementById("chart-cumulative");
  if (!canvas) return;
  let running = 0;
  const cumulative = data.map((v) => {
    running += Number(v);
    return running;
  });
  if (window.cumulativeChartInstance) window.cumulativeChartInstance.destroy();
  window.cumulativeChartInstance = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Cumulative consumption",
          data: cumulative,
          borderColor: PALETTE[2],
          backgroundColor: "rgba(110,207,181,0.25)",
          fill: true,
          tension: 0.25,
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true } },
      plugins: { legend: { display: false } },
    },
  });
  clearChartState("cumulative-chart-state");
}

async function loadCompareChart() {
  const codes = ["compare-a", "compare-b", "compare-c"]
    .map((id) => document.getElementById(id)?.value)
    .filter(Boolean);
  showChartLoading("compare-chart-state");
  if (!codes.length) {
    showChartEmpty("compare-chart-state", "Select at least one material to compare.");
    return;
  }
  try {
    const responses = await Promise.all(
      codes.map((code) => api(`/api/charts/consumption-trend/${encodeURIComponent(code)}`))
    );
    const labels = responses[0].labels || [];
    const datasets = responses.map((chartData, i) => ({
      label: codes[i],
      data: chartData.datasets?.[0]?.data || [],
      borderColor: PALETTE[i % PALETTE.length],
      backgroundColor: "transparent",
      tension: 0.25,
    }));
    const canvas = document.getElementById("chart-compare");
    if (!canvas) return;
    if (window.compareChartInstance) window.compareChartInstance.destroy();
    window.compareChartInstance = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true } },
        plugins: { legend: { position: "bottom" } },
      },
    });
    clearChartState("compare-chart-state");
  } catch (e) {
    showChartError("compare-chart-state", e.message || "Failed to compare materials");
  }
}

async function loadChartsPage() {
  clearError("page-charts");
  showLoading("page-charts");
  try {
    const items = normalizeInventoryItems(await api("/api/inventory/list"));
    populateMaterialSelects(items);
    const categories = [...new Set(items.map((it) => it.category).filter(Boolean))].sort();
    const departments = [...new Set(items.map((it) => itemDepartment(it)).filter(Boolean))].sort();
    for (const [id, values] of [
      ["global-category-filter", categories],
      ["stock-category-filter", categories],
      ["inv-category-filter", categories],
      ["global-dept-filter", departments],
      ["inv-dept-filter", departments],
    ]) {
      const select = document.getElementById(id);
      if (!select || select.dataset.filled) continue;
      for (const value of values) {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = value;
        select.appendChild(opt);
      }
      select.dataset.filled = "1";
    }
    await Promise.all([
      loadStockLevelsChart(),
      loadCategoryChart(),
      loadDeptChart(),
      loadTrendChart(),
    ]);
  } catch (e) {
    showError("page-charts", e.message || "Failed to load charts");
  } finally {
    hideLoading("page-charts");
  }
}

function getFilteredInventoryRows() {
  const search = (document.getElementById("inv-search")?.value || "").trim().toLowerCase();
  const dept = document.getElementById("inv-dept-filter")?.value || "";
  const category = document.getElementById("inv-category-filter")?.value || "";
  const status = document.getElementById("inv-status-filter")?.value || "";
  return window.inventoryData.filter((it) => {
    const code = it.materialCode ?? it.material_code ?? "";
    const name = it.itemName ?? it.item_name ?? "";
    const hay = `${code} ${name} ${itemDepartment(it)} ${it.category ?? ""}`.toLowerCase();
    if (search && !hay.includes(search)) return false;
    if (dept && itemDepartment(it) !== dept) return false;
    if (category && (it.category ?? "") !== category) return false;
    const st = inventoryStatus(it);
    if (status && st !== status) return false;
    return true;
  });
}

function sortInventoryRows(rows) {
  const { key, dir } = inventorySort;
  const mult = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av =
      key === "stockValue"
        ? stockValue(a)
        : key === "department"
          ? itemDepartment(a)
          : key === "consumptionRate"
            ? consumptionRateByCode.get(a.materialCode ?? a.material_code) || 0
            : a[key] ?? a[key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)] ?? "";
    const bv =
      key === "stockValue"
        ? stockValue(b)
        : key === "department"
          ? itemDepartment(b)
          : key === "consumptionRate"
            ? consumptionRateByCode.get(b.materialCode ?? b.material_code) || 0
            : b[key] ?? b[key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)] ?? "";
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * mult;
    return String(av).localeCompare(String(bv)) * mult;
  });
}

function renderInventoryTableBody() {
  const tbody = document.getElementById("inv-tbody");
  const filtered = sortInventoryRows(getFilteredInventoryRows());
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (inventoryPage > pages) inventoryPage = pages;
  const start = (inventoryPage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(start, start + PAGE_SIZE);
  const counter = document.getElementById("inv-record-count");
  if (counter) {
    counter.textContent =
      total === 0
        ? "Showing 0 materials"
        : `Showing ${start + 1}–${start + pageRows.length} of ${total}`;
  }
  if (!tbody) return;
  if (!pageRows.length) {
    tbody.innerHTML =
      '<tr><td colspan="13" class="loading-row">No data returned. Check backend connection.</td></tr>';
    return;
  }
  tbody.innerHTML = pageRows
    .map((it) => {
      const code = it.materialCode ?? it.material_code ?? "";
      const name = it.itemName ?? it.item_name ?? "";
      const dept = itemDepartment(it);
      const cat = it.category ?? "";
      const stock = it.stockQty ?? it.stock_qty ?? 0;
      const unit = it.unit ?? "";
      const reorder = it.reorderLevel ?? it.reorder_level ?? 0;
      const cost = it.unitCost ?? it.unit_cost ?? 0;
      const sval = stockValue(it);
      const rate = consumptionRateByCode.get(code);
      const updated = it.lastUpdated ?? it.last_updated ?? "";
      const status = inventoryStatus(it);
      const incomplete = !code || !name || !cat;
      const badgeClass =
        status === "CRITICAL"
          ? "badge badge-critical"
          : status === "LOW"
            ? "badge badge-low"
            : "badge badge-ok";
      return `<tr data-code="${escapeHtml(code)}" class="${incomplete ? "row-incomplete" : ""}">
        <td>${escapeHtml(code)}</td>
        <td>${escapeHtml(name)}</td>
        <td>${escapeHtml(dept)}</td>
        <td>${escapeHtml(cat)}</td>
        <td class="num">${formatNumber(stock, 2)}</td>
        <td>${escapeHtml(unit)}</td>
        <td class="num">${formatNumber(reorder, 2)}</td>
        <td class="num">${formatNumber(cost, 2)}</td>
        <td class="num">${formatNumber(sval, 2)}</td>
        <td class="num">${rate == null ? "—" : formatNumber(rate, 2)}</td>
        <td>${escapeHtml(updated ? formatDate(updated) : "—")}</td>
        <td><span class="${badgeClass}">${status}</span></td>
        <td class="no-print"><button type="button" class="btn-secondary btn-forecast-link" data-code="${escapeHtml(code)}">View Forecast →</button></td>
      </tr>`;
    })
    .join("");
  renderInventoryPagination(pages);
}

function renderInventoryPagination(pages) {
  const el = document.getElementById("inv-pagination");
  if (!el) return;
  el.innerHTML = "";
  const prev = document.createElement("button");
  prev.textContent = "Prev";
  prev.disabled = inventoryPage <= 1;
  prev.addEventListener("click", () => {
    inventoryPage -= 1;
    renderInventoryTableBody();
  });
  el.appendChild(prev);
  for (let i = 1; i <= pages; i += 1) {
    const btn = document.createElement("button");
    btn.textContent = String(i);
    if (i === inventoryPage) btn.classList.add("active");
    btn.addEventListener("click", () => {
      inventoryPage = i;
      renderInventoryTableBody();
    });
    el.appendChild(btn);
  }
  const next = document.createElement("button");
  next.textContent = "Next";
  next.disabled = inventoryPage >= pages;
  next.addEventListener("click", () => {
    inventoryPage += 1;
    renderInventoryTableBody();
  });
  el.appendChild(next);
}

function updateInventoryValidation() {
  const items = window.inventoryData;
  const missing = items.filter((it) => {
    const code = it.materialCode ?? it.material_code;
    const name = it.itemName ?? it.item_name;
    const cat = it.category;
    return !code || !name || !cat;
  }).length;
  const zero = items.filter((it) => Number(it.stockQty ?? it.stock_qty ?? 0) === 0).length;
  const seen = new Set();
  let dupes = 0;
  for (const it of items) {
    const code = it.materialCode ?? it.material_code;
    if (!code) continue;
    if (seen.has(code)) dupes += 1;
    seen.add(code);
  }
  const panel = document.getElementById("inv-validation");
  const chips = document.getElementById("inv-validation-chips");
  if (!panel || !chips) return;
  if (!missing && !zero && !dupes) {
    panel.hidden = true;
    chips.innerHTML = "";
    return;
  }
  panel.hidden = false;
  const parts = [];
  if (missing) parts.push(`<span class="chip">${missing} rows have incomplete data</span>`);
  if (zero) parts.push(`<span class="chip">${zero} items are at zero stock</span>`);
  if (dupes) parts.push(`<span class="chip">${dupes} duplicate material codes found</span>`);
  chips.innerHTML = parts.join("");
}

async function loadInventoryTable() {
  const sid = "page-inventory";
  clearError(sid);
  showLoading(sid);
  const tbody = document.getElementById("inv-tbody");
  try {
    const data = await api("/api/inventory/list");
    const items = normalizeInventoryItems(data);
    window.inventoryData = items;
    console.log("[SpareAI] inventory total records:", items.length);
    populateMaterialSelects(items);
    document.getElementById("inv-record-count").textContent = `Showing ${items.length} materials`;
    if (items.length < 100) {
      showWarning(
        "inv-warning",
        `⚠ Only ${items.length} records loaded. Expected ~100. Check if the API is paginating or filtering.`
      );
    } else {
      const warn = document.getElementById("inv-warning");
      if (warn) warn.hidden = true;
    }
    const criticalForecast = await api("/api/forecast/critical");
    consumptionRateByCode.clear();
    for (const row of criticalForecast.critical ?? []) {
      const code = row.material_code ?? row.materialCode;
      if (code) {
        consumptionRateByCode.set(
          code,
          Number(row.avg_daily_consumption ?? row.avgDailyConsumption ?? 0)
        );
      }
    }
    inventoryPage = 1;
    renderInventoryTableBody();
    updateInventoryValidation();
    if (tbody && !tbody.dataset.bound) {
      tbody.dataset.bound = "1";
      tbody.addEventListener("click", (ev) => {
        const btn = ev.target.closest(".btn-forecast-link");
        if (!btn) return;
        const code = btn.dataset.code;
        navigateTo("forecast");
        const sel = document.getElementById("forecast-material-select");
        if (sel && code) {
          sel.value = code;
          sel.dispatchEvent(new Event("change"));
        }
      });
    }
  } catch (e) {
    if (tbody) {
      tbody.innerHTML =
        '<tr><td colspan="13" class="loading-row">Could not load inventory.</td></tr>';
    }
    showError(sid, e.message || "Failed to load inventory");
  } finally {
    hideLoading(sid);
  }
}

function severityForDays(days, stock, reorder) {
  if (days <= 7) return { label: "URGENT", className: "badge badge-urgent" };
  if (days <= 30) return { label: "WARNING", className: "badge badge-warning" };
  if (stock <= reorder) return { label: "WATCH", className: "badge badge-watch" };
  return { label: "WATCH", className: "badge badge-watch" };
}

function renderCriticalTable() {
  const tbody = document.getElementById("critical-tbody");
  let rows = [...window.criticalData];
  if (criticalTab !== "all") {
    rows = rows.filter((row) => row.severityKey === criticalTab);
  }
  rows.sort((a, b) => {
    if (a.daysToZero == null) return 1;
    if (b.daysToZero == null) return -1;
    return a.daysToZero - b.daysToZero;
  });
  document.getElementById("critical-record-count").textContent = `Showing ${rows.length} critical items`;
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML =
      '<tr><td colspan="9" class="loading-row">No data returned. Check backend connection.</td></tr>';
    return;
  }
  tbody.innerHTML = rows
    .map((row) => {
      return `<tr>
        <td>${escapeHtml(row.code)}</td>
        <td>${escapeHtml(row.name)}</td>
        <td>${escapeHtml(row.category)}</td>
        <td class="num">${formatNumber(row.stock, 2)}</td>
        <td class="num">${formatNumber(row.reorder, 2)}</td>
        <td class="num">${row.daysToZero == null ? "—" : formatNumber(row.daysToZero, 1)}</td>
        <td>${escapeHtml(row.stockoutDate)}</td>
        <td class="num">${formatNumber(row.suggestedQty, 0)}</td>
        <td><span class="${row.severityClass}">${row.severityLabel}</span></td>
      </tr>`;
    })
    .join("");
}

async function loadCriticalTable() {
  const sid = "page-critical";
  clearError(sid);
  showLoading(sid);
  const tbody = document.getElementById("critical-tbody");
  try {
    const [lowData, critDays] = await Promise.all([
      api("/api/inventory/low-stock"),
      api("/api/forecast/critical").catch(() => []),
    ]);
    const lowStock = lowData.critical ?? lowData.items ?? [];
    const forecastCritical = unwrapCritical(critDays);

    console.log("[FIX DEBUG] /api/inventory/low-stock → raw:", JSON.stringify(lowStock, null, 2));
    console.log("[FIX DEBUG] /api/forecast/critical → raw:", JSON.stringify(forecastCritical, null, 2));
    console.log("[CR1] low-stock keys:", lowStock[0] ? Object.keys(lowStock[0]) : "empty");
    console.log("[CR1] forecast keys:", forecastCritical[0] ? Object.keys(forecastCritical[0]) : "empty");

    const lsCodeKey = detectCriticalKey(lowStock, ["materialCode", "material_code", "code", "id"]);
    const fcCodeKey = detectCriticalKey(forecastCritical, ["materialCode", "material_code", "code", "id"]);
    const dtzKey = detectCriticalKey(forecastCritical, [
      "daysToZero",
      "days_to_zero",
      "days_to_zero_estimate",
      "daystozero",
      "days",
      "eta",
      "daysUntilZero",
    ]);
    console.log("[CR1] lsCodeKey:", lsCodeKey, "fcCodeKey:", fcCodeKey, "dtzKey:", dtzKey);

    const forecastMap = {};
    for (const fc of forecastCritical) {
      const code = fc[fcCodeKey];
      if (code) forecastMap[code] = Number(fc[dtzKey] ?? NaN);
    }

    const merged = lowStock.map((item) => {
      const code = item[lsCodeKey] ?? item.materialCode ?? item.material_code ?? "";
      const stock = Number(item.stockQty ?? item.stock_qty ?? 0);
      const reorder = Number(item.reorderLevel ?? item.reorder_level ?? 0);
      const rawDays = forecastMap[code];
      const daysToZero = Number.isFinite(rawDays) ? rawDays : null;
      const stockout = new Date();
      if (daysToZero != null) stockout.setDate(stockout.getDate() + Math.max(0, Math.ceil(daysToZero)));
      const suggestedQty = Math.ceil(Math.max(0, reorder - stock) * 1.5);
      let severityLabel = "WATCH";
      let severityClass = "badge badge-watch";
      let severityKey = "watch";
      if (daysToZero != null && daysToZero <= 7) {
        severityLabel = "URGENT";
        severityClass = "badge badge-urgent";
        severityKey = "urgent";
      } else if (daysToZero != null && daysToZero <= 30) {
        severityLabel = "WARNING";
        severityClass = "badge badge-warning";
        severityKey = "warning";
      }
      return {
        code,
        name: item.itemName ?? item.item_name ?? "",
        category: item.category ?? "",
        stock,
        reorder,
        unitCost: Number(item.unitCost ?? item.unit_cost ?? 0),
        daysToZero,
        stockoutDate: daysToZero != null ? formatDate(stockout) : "—",
        suggestedQty,
        severityLabel,
        severityClass,
        severityKey,
        gap: Math.max(0, reorder - stock),
      };
    });

    console.log("[CR1] merged sample:", merged.slice(0, 3));
    console.log(
      "[CR1] items with daysToZero:",
      merged.filter((row) => row.daysToZero !== null).length
    );

    merged.sort((a, b) => {
      if (a.daysToZero === null) return 1;
      if (b.daysToZero === null) return -1;
      return a.daysToZero - b.daysToZero;
    });

    window.criticalData = merged;
    const counts = { all: merged.length, urgent: 0, warning: 0, watch: 0 };
    for (const row of merged) counts[row.severityKey] += 1;
    for (const key of Object.keys(counts)) {
      const el = document.getElementById(`tab-count-${key}`);
      if (el) el.textContent = String(counts[key]);
    }
    renderCriticalTable();
    const urgent = merged.filter((r) => r.severityKey === "urgent").sort((a, b) => a.daysToZero - b.daysToZero)[0];
    const costly = [...merged].sort((a, b) => b.unitCost - a.unitCost)[0];
    const gap = [...merged].sort((a, b) => b.gap - a.gap)[0];
    document.getElementById("priority-urgent").querySelector("p").textContent = urgent
      ? `${urgent.code} · ${formatNumber(urgent.daysToZero, 1)} days`
      : "—";
    document.getElementById("priority-cost").querySelector("p").textContent = costly
      ? `${costly.code} · ₹${formatNumber(costly.unitCost, 2)}`
      : "—";
    document.getElementById("priority-gap").querySelector("p").textContent = gap
      ? `${gap.code} · gap ${formatNumber(gap.gap, 2)}`
      : "—";
  } catch (e) {
    if (tbody) {
      tbody.innerHTML =
        '<tr><td colspan="9" class="loading-row">Could not load critical items.</td></tr>';
    }
    showError(sid, e.message || "Failed to load low-stock data");
  } finally {
    hideLoading(sid);
  }
}

function setForecastMeta(code, horizon) {
  const meta = document.getElementById("forecast-meta");
  if (!meta) return;
  const name = code ? materialNameByCode.get(code) || "" : "";
  meta.textContent = code
    ? `${name ? `${name} · ` : ""}${code} · horizon ${horizon} days`
    : "";
}

function updateForecastStats(rows) {
  const yhat = rows.map((r) => Number(r.yhat ?? 0));
  if (!yhat.length) return;
  const total = yhat.reduce((a, b) => a + b, 0);
  const avg = total / yhat.length;
  let peak = yhat[0];
  let low = yhat[0];
  let peakDate = rows[0].ds;
  let lowDate = rows[0].ds;
  yhat.forEach((v, i) => {
    if (v > peak) {
      peak = v;
      peakDate = rows[i].ds;
    }
    if (v < low) {
      low = v;
      lowDate = rows[i].ds;
    }
  });
  document.getElementById("fs-avg").textContent = formatNumber(avg, 2);
  document.getElementById("fs-peak").textContent = `${formatNumber(peak, 2)} (${formatDate(peakDate)})`;
  document.getElementById("fs-low").textContent = `${formatNumber(low, 2)} (${formatDate(lowDate)})`;
  document.getElementById("fs-total").textContent = formatNumber(total, 2);
}

function updateProcurementBox(materialCode, rows, currentStock) {
  const box = document.getElementById("procurement-box");
  if (!box) return;
  const yhat = rows.map((r) => Number(r.yhat ?? 0));
  const total = yhat.reduce((a, b) => a + b, 0);
  const avgDaily = yhat.length ? total / yhat.length : 0;
  if (total > currentStock) {
    const stockout = new Date();
    stockout.setDate(stockout.getDate() + Math.max(1, Math.ceil(currentStock / Math.max(avgDaily, 1))));
    box.textContent = `⚠ Procure at least ${formatNumber(total - currentStock, 0)} units before ${formatDate(stockout)}`;
  } else if (currentStock > 3 * avgDaily * rows.length) {
    box.textContent = `📦 Overstock risk: ${formatNumber(currentStock - 3 * avgDaily * rows.length, 0)} units excess for this period`;
  } else {
    box.textContent = "✅ Stock adequate for forecast period";
  }
}

async function loadHistoricalConsumptionChart(materialCode) {
  showChartLoading("historical-chart-state");
  if (!materialCode) {
    showChartEmpty("historical-chart-state", "Select a material to view historical consumption.");
    return;
  }
  try {
    const chartData = await api(`/api/charts/consumption-trend/${encodeURIComponent(materialCode)}`);
    const labels = chartData.labels || [];
    const data = chartData.datasets?.[0]?.data || [];
    const canvas = document.getElementById("chart-historical");
    if (!canvas) return;
    if (window.historicalChartInstance) window.historicalChartInstance.destroy();
    window.historicalChartInstance = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Historical Consumption",
            data,
            borderColor: PALETTE[2],
            backgroundColor: "transparent",
            tension: 0.25,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true } },
        plugins: { legend: { display: false } },
      },
    });
    clearChartState("historical-chart-state");
  } catch (e) {
    showChartError("historical-chart-state", e.message || "Failed to load historical consumption");
  }
}

async function loadForecastChart(materialCode, horizon = 30) {
  const box = document.querySelector(".chart-box--forecast");
  const placeholder = document.getElementById("forecast-placeholder");
  const sid = "page-forecast";
  clearError(sid);
  if (!materialCode) {
    setForecastMeta("", horizon);
    if (window.forecastChartInstance) {
      window.forecastChartInstance.destroy();
      window.forecastChartInstance = null;
    }
    box?.classList.remove("has-chart");
    return;
  }
  showLoading(sid);
  try {
    const data = await api(`/api/forecast/${encodeURIComponent(materialCode)}?horizon=${horizon}`);
    const rows = data.forecast || [];
    const labels = rows.map((r) => r.ds);
    const yhat = rows.map((r) => Number(r.yhat ?? 0));
    const upper = rows.map((r) => Number(r.yhat_upper ?? r.yhat ?? 0));
    const lower = rows.map((r) => Number(r.yhat_lower ?? r.yhat ?? 0));
    const canvas = document.getElementById("chart-forecast");
    if (!canvas) return;
    if (window.forecastChartInstance) {
      window.forecastChartInstance.destroy();
      window.forecastChartInstance = null;
    }
    if (!rows.length) {
      box?.classList.remove("has-chart");
      if (placeholder) placeholder.textContent = "No forecast data for this material.";
      setForecastMeta(materialCode, horizon);
      showChartEmpty("forecast-chart-state", "No data returned. Check backend connection.");
      return;
    }
    box?.classList.add("has-chart");
    if (placeholder) placeholder.textContent = "";
    window.forecastChartInstance = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Forecast (yhat)",
            data: yhat,
            borderColor: "#2E7CF6",
            backgroundColor: "transparent",
            borderWidth: 2.5,
            tension: 0.25,
            fill: false,
            pointRadius: 0,
            order: 3,
          },
          {
            label: "Upper bound",
            data: upper,
            borderColor: "rgba(46,124,246,0.15)",
            backgroundColor: "rgba(46,124,246,0.15)",
            borderDash: [6, 4],
            borderWidth: 1.5,
            tension: 0.25,
            fill: "-1",
            pointRadius: 0,
            hidden: !bandVisible,
            order: 1,
          },
          {
            label: "Lower bound",
            data: lower,
            borderColor: "rgba(46,124,246,0.15)",
            backgroundColor: "transparent",
            borderDash: [6, 4],
            borderWidth: 1.5,
            tension: 0.25,
            fill: false,
            pointRadius: 0,
            hidden: !bandVisible,
            order: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        scales: {
          x: {
            ticks: {
              maxTicksLimit: 12,
              callback(val) {
                return formatDate(this.getLabelForValue(val));
              },
            },
          },
          y: { beginAtZero: true },
        },
        plugins: {
          legend: { position: "bottom" },
          zoom: {
            zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: "x" },
            pan: { enabled: true, mode: "x" },
          },
          tooltip: {
            callbacks: {
              title(items) {
                return formatDate(items[0]?.label);
              },
            },
          },
        },
      },
    });
    updateForecastStats(rows);
    updateProcurementBox(materialCode, rows, Number(data.current_stock_qty ?? data.currentStockQty ?? 0));
    setForecastMeta(materialCode, horizon);
    clearChartState("forecast-chart-state");
    await loadHistoricalConsumptionChart(materialCode);
  } catch (e) {
    if (window.forecastChartInstance) {
      window.forecastChartInstance.destroy();
      window.forecastChartInstance = null;
    }
    box?.classList.remove("has-chart");
    if (placeholder) placeholder.textContent = "Forecast could not be loaded.";
    showError(sid, e.message || "Forecast request failed");
  } finally {
    hideLoading(sid);
  }
}

function initForecastPage() {
  const sel = document.getElementById("forecast-material-select");
  if (sel && sel.options.length <= 1) {
    api("/api/inventory/list").then((data) => {
      populateMaterialSelects(normalizeInventoryItems(data));
    });
  }
}

function exportChartByKey(key) {
  const map = {
    stock: window.stockLevelsChartInstance,
    category: window.categoryChartInstance,
    dept: window.deptChartInstance,
    trend: window.trendChartInstance,
    cumulative: window.cumulativeChartInstance,
    compare: window.compareChartInstance,
  };
  const chart = map[key];
  if (!chart) return;
  chart.canvas.toBlob((blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `spareai-${key}.png`;
    a.click();
  });
}

function exportCsv(filename, rows, headers) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      headers
        .map((h) => {
          const value = row[h] ?? "";
          const text = String(value).replace(/"/g, '""');
          return `"${text}"`;
        })
        .join(",")
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function downloadOverviewReport() {
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>SpareAI Report</title></head><body>
    <h1>SpareAI Report</h1>
    <p>Generated: ${new Date().toLocaleString()}</p>
    <h2>Overview KPIs</h2>
    <ul>
      <li>Total materials: ${document.querySelector("#kpi-total-materials .kpi-value")?.textContent || "—"}</li>
      <li>Total stock value: ${document.querySelector("#kpi-total-value .kpi-value")?.textContent || "—"}</li>
      <li>Critical items: ${document.querySelector("#kpi-critical .kpi-value")?.textContent || "—"}</li>
    </ul>
    <h2>Critical stock (${window.criticalData.length})</h2>
    <pre>${escapeHtml(JSON.stringify(window.criticalData.slice(0, 20), null, 2))}</pre>
  </body></html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "spareai-report.html";
  a.click();
}

function bindThemeToggle() {
  const toggleBtn = document.getElementById("theme-toggle");
  if (!toggleBtn || toggleBtn.dataset.bound) return;
  toggleBtn.dataset.bound = "1";
  syncThemeToggleButton();
  toggleBtn.addEventListener("click", () => {
    document.body.classList.toggle("dark-mode");
    const dark = isDarkMode();
    localStorage.setItem("spareai-theme", dark ? "dark" : "light");
    syncThemeToggleButton();
    refreshChartTheme();
  });
}

function bindRouter() {
  document.querySelectorAll(".nav-item, .nav-hash").forEach((el) => {
    el.addEventListener("click", (ev) => {
      const page = el.dataset.page;
      if (!page) return;
      ev.preventDefault();
      navigateTo(page);
    });
  });
  window.addEventListener("hashchange", () => {
    const hash = window.location.hash.slice(1);
    navigateTo(resolvePage(hash));
  });
}

function bindInventoryControls() {
  ["inv-search", "inv-dept-filter", "inv-category-filter", "inv-status-filter"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el || el.dataset.bound) return;
    el.dataset.bound = "1";
    el.addEventListener(id === "inv-search" ? "keyup" : "change", () => {
      inventoryPage = 1;
      renderInventoryTableBody();
    });
  });
  document.querySelectorAll("#inventory-table th[data-sort]").forEach((th) => {
    if (th.dataset.bound) return;
    th.dataset.bound = "1";
    th.style.cursor = "pointer";
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (inventorySort.key === key) {
        inventorySort.dir = inventorySort.dir === "asc" ? "desc" : "asc";
      } else {
        inventorySort = { key, dir: "asc" };
      }
      renderInventoryTableBody();
    });
  });
  const exportBtn = document.getElementById("btn-export-inventory");
  if (exportBtn && !exportBtn.dataset.bound) {
    exportBtn.dataset.bound = "1";
    exportBtn.addEventListener("click", () => {
      exportCsv(
        "spareai-inventory.csv",
        window.inventoryData.map((it) => ({
          materialCode: it.materialCode ?? it.material_code,
          itemName: it.itemName ?? it.item_name,
          department: itemDepartment(it),
          category: it.category,
          stockQty: it.stockQty ?? it.stock_qty,
          unit: it.unit,
          reorderLevel: it.reorderLevel ?? it.reorder_level,
          unitCost: it.unitCost ?? it.unit_cost,
          stockValue: stockValue(it),
          consumptionRate: consumptionRateByCode.get(it.materialCode ?? it.material_code) ?? "",
          lastUpdated: it.lastUpdated ?? it.last_updated ?? "",
          status: inventoryStatus(it),
        })),
        [
          "materialCode",
          "itemName",
          "department",
          "category",
          "stockQty",
          "unit",
          "reorderLevel",
          "unitCost",
          "stockValue",
          "consumptionRate",
          "lastUpdated",
          "status",
        ]
      );
    });
  }
}

function bindCriticalControls() {
  document.querySelectorAll("#critical-tabs .tab-btn").forEach((btn) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", () => {
      document.querySelectorAll("#critical-tabs .tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      criticalTab = btn.dataset.tab;
      renderCriticalTable();
    });
  });
  const exportBtn = document.getElementById("btn-export-critical");
  if (exportBtn && !exportBtn.dataset.bound) {
    exportBtn.dataset.bound = "1";
    exportBtn.addEventListener("click", () => {
      exportCsv(
        "spareai-critical.csv",
        window.criticalData,
        [
          "code",
          "name",
          "category",
          "stock",
          "reorder",
          "daysToZero",
          "stockoutDate",
          "suggestedQty",
          "severityLabel",
        ]
      );
    });
  }
  const printBtn = document.getElementById("btn-print-critical");
  if (printBtn && !printBtn.dataset.bound) {
    printBtn.dataset.bound = "1";
    printBtn.addEventListener("click", () => window.print());
  }
}

function bindChartControls() {
  document.getElementById("global-category-filter")?.addEventListener("change", (ev) => {
    const value = ev.target.value;
    const stockFilter = document.getElementById("stock-category-filter");
    if (stockFilter) stockFilter.value = value;
    loadStockLevelsChart();
    loadCategoryChart();
  });
  document.getElementById("global-dept-filter")?.addEventListener("change", loadDeptChart);
  document.querySelectorAll(".gran-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".gran-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      loadTrendChart();
    });
  });
  document.getElementById("stock-category-filter")?.addEventListener("change", loadStockLevelsChart);
  document.querySelectorAll(".stock-topn-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".stock-topn-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const topn = btn.dataset.topn || "20";
      window.stockTopN = topn === "all" ? "all" : Number(topn);
      const select = document.getElementById("stock-topn");
      if (select) select.value = topn;
      loadStockLevelsChart();
    });
  });
  document.getElementById("stock-topn")?.addEventListener("change", loadStockLevelsChart);
  document.getElementById("cat-mode-count")?.addEventListener("click", () => {
    categoryMode = "count";
    document.getElementById("cat-mode-count")?.classList.add("active");
    document.getElementById("cat-mode-value")?.classList.remove("active");
    loadCategoryChart();
  });
  document.getElementById("cat-mode-value")?.addEventListener("click", () => {
    categoryMode = "value";
    document.getElementById("cat-mode-value")?.classList.add("active");
    document.getElementById("cat-mode-count")?.classList.remove("active");
    loadCategoryChart();
  });
  document.getElementById("trend-material-select")?.addEventListener("change", loadTrendChart);
  document.querySelectorAll(".range-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".range-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      trendRange = btn.dataset.range;
      const custom = document.getElementById("custom-range-inputs");
      if (custom) custom.hidden = trendRange !== "custom";
      if (trendRange !== "custom") loadTrendChart();
    });
  });
  document.getElementById("apply-range")?.addEventListener("click", loadTrendChart);
  document.getElementById("btn-compare")?.addEventListener("click", loadCompareChart);
  document.querySelectorAll(".btn-export[data-export]").forEach((btn) => {
    btn.addEventListener("click", () => exportChartByKey(btn.dataset.export));
  });
}

function bindForecastControls() {
  document.querySelectorAll(".horizon-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      currentHorizon = Number(btn.dataset.horizon) || 30;
      document.querySelectorAll(".horizon-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const code = document.getElementById("forecast-material-select")?.value;
      if (code) await loadForecastChart(code, currentHorizon);
    });
  });
  const sel = document.getElementById("forecast-material-select");
  if (sel && !sel.dataset.bound) {
    sel.dataset.bound = "1";
    sel.addEventListener("change", () => loadForecastChart(sel.value, currentHorizon));
  }
  const bandBtn = document.getElementById("band-toggle");
  if (bandBtn && !bandBtn.dataset.bound) {
    bandBtn.dataset.bound = "1";
    bandBtn.addEventListener("click", () => {
      bandVisible = !bandVisible;
      bandBtn.textContent = bandVisible ? "☁ Band ON" : "☁ Band OFF";
      bandBtn.setAttribute("aria-pressed", String(bandVisible));
      const chart = window.forecastChartInstance;
      if (!chart) return;
      chart.data.datasets[1].hidden = !bandVisible;
      chart.data.datasets[2].hidden = !bandVisible;
      chart.update();
    });
  }
  document.getElementById("btn-reset-zoom")?.addEventListener("click", () => {
    window.forecastChartInstance?.resetZoom();
  });
}

function bindSidebar() {
  const toggle = document.getElementById("sidebar-toggle");
  if (!toggle || toggle.dataset.bound) return;
  toggle.dataset.bound = "1";
  toggle.addEventListener("click", () => {
    document.body.classList.toggle("sidebar-open");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  applySavedTheme();
  bindSidebar();
  bindRouter();
  bindThemeToggle();
  bindInventoryControls();
  bindCriticalControls();
  bindChartControls();
  bindForecastControls();
  document.getElementById("btn-download-report")?.addEventListener("click", downloadOverviewReport);
  document.getElementById("btn-print-overview")?.addEventListener("click", () => window.print());
  const hash = location.hash.slice(1);
  const startPage = VALID_PAGES.includes(hash) ? hash : "overview";
  navigateTo(startPage);
});
