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
let parametersPage = 1;
let parametersSort = { key: "materialCode", dir: "asc" };
const parametersDirty = new Set();
window.stockTopN = 20;

const PARAM_DEFAULTS = {
  criticalPct: 0.5,
  urgentDays: 7,
  warningDays: 30,
  overstockMultiplier: 3,
  reorderQtyFactor: 1.5,
  alertsEnabled: true,
  priority: 0,
};

/**
 * Presets for bulk reset. Original uses reorder levels from Excel import (excel-inventory-baseline.json).
 * New uses consumption-based formulas (see buildPresetFields).
 */
const PARAM_PRESETS = {
  original: {
    label: "Original defaults",
    from_excel: true,
    summary:
      "Reorder levels from Excel import (spareai_real_data) · legacy alert thresholds (50% critical, 7/30 days, 3× overstock, 1.5× reorder qty) · optional fields cleared",
    critical_pct: 0.5,
    urgent_days: 7,
    warning_days: 30,
    overstock_multiplier: 3,
    reorder_qty_factor: 1.5,
    lead_time_days: null,
    alerts_enabled: true,
    priority: 0,
    param_notes: "",
  },
  new: {
    label: "New defaults",
    summary:
      "Reorder = 14d lead × 2× consumption · safety = 40% of reorder · 40% critical · 5/21 day alerts · 2.5× overstock · 2× reorder qty · min order 1",
    reorder_days_supply: null,
    reorder_lead_mult: true,
    safety_ratio: 0.4,
    critical_pct: 0.4,
    urgent_days: 5,
    warning_days: 21,
    overstock_multiplier: 2.5,
    reorder_qty_factor: 2,
    lead_time_days: 14,
    max_stock_from_reorder: true,
    min_order_qty: 1,
    alerts_enabled: true,
    priority: 0,
    param_notes: "",
  },
};

window.inventoryData = [];
window.criticalData = [];
let excelBaselineByCode = null;
let excelBaselineLoadPromise = null;

async function loadExcelBaseline() {
  if (excelBaselineByCode) return excelBaselineByCode;
  if (excelBaselineLoadPromise) return excelBaselineLoadPromise;
  excelBaselineLoadPromise = (async () => {
    const base = ctxPath();
    const url = `${base}/assets/excel-inventory-baseline.json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Could not load Excel baseline data");
    excelBaselineByCode = await res.json();
    return excelBaselineByCode;
  })();
  return excelBaselineLoadPromise;
}

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

async function apiPut(path, body) {
  const base = ctxPath();
  const url = `${base}${path.startsWith("/") ? path : "/" + path}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let payload = {};
  try {
    payload = await res.json();
  } catch {
    payload = {};
  }
  if (!res.ok) {
    const msg =
      payload.error?.message || payload.message || res.statusText || "Request failed";
    throw new Error(msg);
  }
  if (payload.success === false) {
    throw new Error(payload.error?.message || payload.message || "API error");
  }
  return payload.data !== undefined ? payload.data : payload;
}

async function apiPost(path, body) {
  const base = ctxPath();
  const url = `${base}${path.startsWith("/") ? path : "/" + path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let payload = {};
  try {
    payload = await res.json();
  } catch {
    payload = {};
  }
  if (!res.ok) {
    const msg =
      payload.error?.message || payload.message || res.statusText || "Request failed";
    throw new Error(msg);
  }
  if (payload.success === false) {
    throw new Error(payload.error?.message || payload.message || "API error");
  }
  return payload.data !== undefined ? payload.data : payload;
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

function monthKey(ds) {
  if (!ds) return "";
  const s = String(ds).trim();
  if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function formatMonthLabel(monthOrDs) {
  const key = monthKey(monthOrDs);
  if (!key) return "";
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function buildMonthlyForecastChartData(historyLabels, historyData, forecastRows) {
  const actualByMonth = {};
  (historyLabels || []).forEach((lbl, i) => {
    const k = monthKey(lbl);
    if (k) actualByMonth[k] = Number(historyData[i] ?? 0);
  });
  const forecastByMonth = {};
  const upperByMonth = {};
  const lowerByMonth = {};
  (forecastRows || []).forEach((row) => {
    const k = monthKey(row.ds);
    if (!k) return;
    forecastByMonth[k] = Number(row.yhat ?? 0);
    upperByMonth[k] = Number(row.yhat_upper ?? row.yhat ?? 0);
    lowerByMonth[k] = Number(row.yhat_lower ?? row.yhat ?? 0);
  });

  const labelSet = new Set([...Object.keys(actualByMonth), ...Object.keys(forecastByMonth)]);
  const labels = [...labelSet].sort();
  const actuals = labels.map((k) => (actualByMonth[k] != null ? actualByMonth[k] : null));
  const forecast = labels.map((k) => (forecastByMonth[k] != null ? forecastByMonth[k] : null));
  const upper = labels.map((k) => (upperByMonth[k] != null ? upperByMonth[k] : null));
  const lower = labels.map((k) => (lowerByMonth[k] != null ? lowerByMonth[k] : null));
  const displayLabels = labels.map(formatMonthLabel);
  return { labels: displayLabels, monthKeys: labels, actuals, forecast, upper, lower };
}

function stockValue(item) {
  const q = Number(item.stockQty ?? item.stock_qty ?? 0);
  const c = Number(item.unitCost ?? item.unit_cost ?? 0);
  return q * c;
}

function itemDepartment(item) {
  return item.department ?? item.location ?? "";
}

function resolveParams(item) {
  if (!item) return { ...PARAM_DEFAULTS, reorder: 0, safetyStock: 0 };
  const reorder = Number(item.reorderLevel ?? item.reorder_level ?? 0);
  const safetyRaw = item.safetyStock ?? item.safety_stock;
  const safetyStock =
    safetyRaw != null && safetyRaw !== "" && !Number.isNaN(Number(safetyRaw))
      ? Number(safetyRaw)
      : reorder;
  const alertsRaw = item.alertsEnabled ?? item.alerts_enabled;
  const alertsEnabled = alertsRaw === false || alertsRaw === 0 || alertsRaw === "0" ? false : true;
  return {
    reorder,
    safetyStock,
    criticalPct: Number(item.criticalPct ?? item.critical_pct ?? PARAM_DEFAULTS.criticalPct),
    urgentDays: Number(item.urgentDays ?? item.urgent_days ?? PARAM_DEFAULTS.urgentDays),
    warningDays: Number(item.warningDays ?? item.warning_days ?? PARAM_DEFAULTS.warningDays),
    overstockMultiplier: Number(
      item.overstockMultiplier ?? item.overstock_multiplier ?? PARAM_DEFAULTS.overstockMultiplier
    ),
    reorderQtyFactor: Number(
      item.reorderQtyFactor ?? item.reorder_qty_factor ?? PARAM_DEFAULTS.reorderQtyFactor
    ),
    leadTimeDays: item.leadTimeDays ?? item.lead_time_days ?? null,
    maxStock: item.maxStock ?? item.max_stock ?? null,
    minOrderQty: item.minOrderQty ?? item.min_order_qty ?? null,
    alertsEnabled,
    priority: Number(item.priority ?? PARAM_DEFAULTS.priority),
    paramNotes: item.paramNotes ?? item.param_notes ?? "",
  };
}

function inventoryStatus(item) {
  const stock = Number(item.stockQty ?? item.stock_qty ?? 0);
  const p = resolveParams(item);
  if (!p.alertsEnabled || p.reorder <= 0) return "OK";
  if (stock <= p.reorder * p.criticalPct) return "CRITICAL";
  if (stock <= p.reorder) return "LOW";
  return "OK";
}

function severityForItem(daysToZero, stock, item) {
  const p = resolveParams(item);
  if (!p.alertsEnabled) {
    return { label: "OFF", className: "badge badge-muted", key: "watch" };
  }
  if (daysToZero != null && daysToZero <= p.urgentDays) {
    return { label: "URGENT", className: "badge badge-urgent", key: "urgent" };
  }
  if (daysToZero != null && daysToZero <= p.warningDays) {
    return { label: "WARNING", className: "badge badge-warning", key: "warning" };
  }
  if (stock <= p.reorder) {
    return { label: "WATCH", className: "badge badge-watch", key: "watch" };
  }
  return { label: "WATCH", className: "badge badge-watch", key: "watch" };
}

function suggestedReorderQty(stock, reorder, item) {
  const p = resolveParams(item);
  const gap = Math.max(0, reorder - stock);
  let qty = Math.ceil(gap * p.reorderQtyFactor);
  const minOrder = p.minOrderQty != null && p.minOrderQty !== "" ? Number(p.minOrderQty) : null;
  if (minOrder != null && !Number.isNaN(minOrder) && minOrder > 0 && qty > 0 && qty < minOrder) {
    qty = Math.ceil(minOrder);
  }
  return qty;
}

function invalidateDataPages() {
  loaded.overview = false;
  loaded.inventory = false;
  loaded.critical = false;
  loaded.parameters = false;
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

function escapeAttr(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function tipSourceCell(text, extraClass = "") {
  const t = text == null ? "" : String(text);
  const cls = extraClass ? ` cell-tip-source ${extraClass}` : " cell-tip-source";
  return `<td class="${cls.trim()}" data-tip-source="${escapeAttr(t)}">${escapeHtml(t)}</td>`;
}

function getOrCreateTableTooltip() {
  let el = document.getElementById("table-cell-tooltip");
  if (!el) {
    el = document.createElement("div");
    el.id = "table-cell-tooltip";
    el.setAttribute("role", "tooltip");
    el.hidden = true;
    document.body.appendChild(el);
  }
  return el;
}

let tableTooltipActiveCell = null;

function hideTableCellTooltip() {
  const tip = document.getElementById("table-cell-tooltip");
  if (tip) tip.hidden = true;
  tableTooltipActiveCell = null;
}

function positionTableCellTooltip(tip, cell) {
  const r = cell.getBoundingClientRect();
  tip.style.left = `${r.left}px`;
  tip.style.top = `${r.bottom + 6}px`;
  tip.hidden = false;
  requestAnimationFrame(() => {
    const tr = tip.getBoundingClientRect();
    let left = r.left;
    let top = r.bottom + 6;
    if (tr.right > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - tr.width - 12);
    }
    if (tr.bottom > window.innerHeight - 12) {
      top = Math.max(12, r.top - tr.height - 6);
    }
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  });
}

function applyOverflowTooltips(container) {
  if (!container) return;
  container.querySelectorAll("td.cell-tip-source").forEach((cell) => {
    const full = cell.getAttribute("data-tip-source") || "";
    const overflow = !!full && cell.scrollWidth > cell.clientWidth + 1;
    cell.classList.toggle("has-overflow-tip", overflow);
  });
}

function initTableOverflowTooltips() {
  if (window._tableOverflowTooltipInited) return;
  window._tableOverflowTooltipInited = true;
  const tip = getOrCreateTableTooltip();

  document.addEventListener("mouseover", (e) => {
    const cell = e.target.closest("td.cell-tip-source.has-overflow-tip");
    if (!cell) {
      if (tableTooltipActiveCell && !e.target.closest("#table-cell-tooltip")) {
        hideTableCellTooltip();
      }
      return;
    }
    if (tableTooltipActiveCell === cell) return;
    tableTooltipActiveCell = cell;
    tip.textContent = cell.getAttribute("data-tip-source") || "";
    positionTableCellTooltip(tip, cell);
  });

  document.addEventListener("scroll", () => hideTableCellTooltip(), true);

  window.addEventListener(
    "resize",
    debounce(() => {
      document.querySelectorAll("#critical-tbody, #inv-tbody, #param-tbody").forEach((tb) => {
        if (tb) applyOverflowTooltips(tb);
      });
    }, 150)
  );
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

const MATERIAL_SEARCHABLE_SELECT_IDS = [
  "forecast-material-select",
  "trend-material-select",
  "compare-a",
  "compare-b",
  "compare-c",
  "drilldown-dept-material",
];

const FILTER_SEARCHABLE_SELECT_IDS = [
  "global-dept-filter",
  "global-category-filter",
  "stock-category-filter",
  "inv-dept-filter",
  "inv-category-filter",
  "inv-status-filter",
];

function searchableSelectConfig(selectEl) {
  if (MATERIAL_SEARCHABLE_SELECT_IDS.includes(selectEl.id)) {
    return { placeholder: "Search code, name, or category…" };
  }
  if (selectEl.id === "drilldown-dept-material") {
    return { placeholder: "Search code or name in department…" };
  }
  if (selectEl.id.includes("dept")) {
    return { placeholder: "Search department…" };
  }
  if (selectEl.id.includes("category")) {
    return { placeholder: "Search category / group…" };
  }
  return { placeholder: "Type to search…" };
}

function enhanceSearchableSelect(selectEl, options = {}) {
  if (!selectEl || selectEl.dataset.searchableEnhanced === "1") return selectEl;
  const cfg = { ...searchableSelectConfig(selectEl), ...options };
  selectEl.dataset.searchableEnhanced = "1";
  selectEl.classList.add("searchable-select-native");

  const wrap = document.createElement("div");
  wrap.className = "searchable-select";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "searchable-select-input";
  input.placeholder = cfg.placeholder || "Type to search…";
  input.autocomplete = "off";
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.id = `${selectEl.id}-search`;

  const panel = document.createElement("div");
  panel.className = "searchable-select-panel";
  panel.hidden = true;

  const list = document.createElement("ul");
  list.className = "searchable-select-list";
  list.setAttribute("role", "listbox");
  panel.appendChild(list);

  const label = document.querySelector(`label[for="${selectEl.id}"]`);
  if (label) label.setAttribute("for", input.id);

  const host = selectEl.parentElement;
  if (host) {
    host.insertBefore(wrap, selectEl);
    wrap.appendChild(input);
    wrap.appendChild(panel);
    wrap.appendChild(selectEl);
  }

  let activeIndex = -1;

  function getOptionEntries() {
    return [...selectEl.options].map((opt) => ({
      value: opt.value,
      label: opt.textContent || "",
      search: (opt.dataset.search || opt.textContent || "").toLowerCase(),
    }));
  }

  function syncInputFromSelect() {
    const opt = selectEl.selectedOptions[0];
    input.value = opt?.value ? opt.textContent : "";
  }

  function closePanel() {
    panel.hidden = true;
    input.setAttribute("aria-expanded", "false");
    activeIndex = -1;
    syncInputFromSelect();
  }

  function pickOption(value) {
    selectEl.value = value;
    syncInputFromSelect();
    closePanel();
    selectEl.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function highlightActive() {
    const items = [...list.querySelectorAll(".searchable-select-option")];
    items.forEach((li, i) => li.classList.toggle("is-active", i === activeIndex));
    if (activeIndex >= 0 && items[activeIndex]) {
      items[activeIndex].scrollIntoView({ block: "nearest" });
    }
  }

  function renderList(query = "") {
    const q = query.trim().toLowerCase();
    const entries = getOptionEntries();
    list.innerHTML = "";
    activeIndex = -1;
    let shown = 0;
    for (const entry of entries) {
      if (!entry.value && !q) continue;
      if (q && !entry.search.includes(q) && !entry.label.toLowerCase().includes(q)) continue;
      const li = document.createElement("li");
      li.className = "searchable-select-option";
      li.setAttribute("role", "option");
      li.dataset.value = entry.value;
      li.textContent = entry.label || entry.value || "—";
      if (selectEl.value === entry.value) li.classList.add("is-selected");
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        pickOption(entry.value);
      });
      list.appendChild(li);
      shown += 1;
      if (shown >= 100) break;
    }
    if (!shown) {
      const empty = document.createElement("li");
      empty.className = "searchable-select-empty";
      empty.textContent = "No matches";
      list.appendChild(empty);
    }
    panel.hidden = false;
    input.setAttribute("aria-expanded", "true");
    highlightActive();
  }

  input.addEventListener("focus", () => renderList(input.value));
  input.addEventListener("input", () => renderList(input.value));
  input.addEventListener("keydown", (e) => {
    const items = () => [...list.querySelectorAll(".searchable-select-option")];
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const n = items().length;
      if (!n) return;
      activeIndex = activeIndex < n - 1 ? activeIndex + 1 : 0;
      highlightActive();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const n = items().length;
      if (!n) return;
      activeIndex = activeIndex > 0 ? activeIndex - 1 : n - 1;
      highlightActive();
    } else if (e.key === "Enter") {
      const pick = items()[activeIndex] || items()[0];
      if (pick) {
        e.preventDefault();
        pickOption(pick.dataset.value);
      }
    } else if (e.key === "Escape") {
      closePanel();
      input.blur();
    }
  });

  document.addEventListener(
    "click",
    (e) => {
      if (!wrap.contains(e.target)) closePanel();
    },
    true
  );

  selectEl.addEventListener("change", syncInputFromSelect);
  syncInputFromSelect();
  selectEl._searchableSync = syncInputFromSelect;
  return selectEl;
}

function refreshSearchableSelect(selectEl) {
  if (!selectEl) return;
  if (selectEl.dataset.searchableEnhanced !== "1") {
    enhanceSearchableSelect(selectEl);
    return;
  }
  selectEl._searchableSync?.();
}

function initAllSearchableSelects() {
  for (const id of [...MATERIAL_SEARCHABLE_SELECT_IDS, ...FILTER_SEARCHABLE_SELECT_IDS]) {
    const el = document.getElementById(id);
    if (el) enhanceSearchableSelect(el);
  }
}

function filterDropdownItems(ul, itemSelector, query) {
  const q = query.trim().toLowerCase();
  ul.querySelectorAll(itemSelector).forEach((li) => {
    const hay = (li.dataset.search || li.textContent || "").toLowerCase();
    li.style.display = !q || hay.includes(q) ? "" : "none";
  });
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
      "avgDailyConsumption",
      "avg_daily_consumption",
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
  const sample = Array.isArray(rows) ? rows[0] || {} : rows || {};
  return candidates.find((k) => sample[k] !== undefined && sample[k] !== null) || null;
}

/** Days until stockout from a forecast/critical API row (all known field names). */
function rowDaysToZero(row) {
  if (!row) return null;
  const keys = [
    "days_to_zero_estimate",
    "daysToZero",
    "days_to_zero",
    "daystozero",
    "eta",
    "days",
  ];
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null) {
      const n = Number(row[k]);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function detectKey(obj, candidates) {
  return candidates.find((k) => obj && obj[k] !== undefined && obj[k] !== null);
}

function materialCodeFromItem(item, codeKey) {
  const key = codeKey || window._matCodeKey || "materialCode";
  return String(item?.[key] ?? item?.material_code ?? item?.materialCode ?? "").trim();
}

function resolveMaterialRow(materialCode) {
  const code = String(materialCode ?? "").trim();
  if (!code) return null;
  const codeKey = window._matCodeKey || "materialCode";
  const items = window.inventoryData || [];
  const inv = items.find((i) => materialCodeFromItem(i, codeKey) === code);
  if (inv) return { row: inv, codeKey };
  const ctx = window._drilldownContextRows || [];
  const ctxRow = ctx.find((i) => materialCodeFromItem(i, codeKey) === code);
  if (ctxRow) return { row: ctxRow, codeKey: detectKey(ctxRow, ["materialCode", "material_code", "code"]) || codeKey };
  return null;
}

function destroyDrilldownCharts() {
  if (typeof Chart === "undefined") return;
  document.querySelectorAll("#overview-drilldown-panel canvas").forEach((canvas) => {
    const chart = Chart.getChart(canvas);
    if (chart) chart.destroy();
  });
  window.drilldownChartInstance = null;
  window.drilldownForecastChartInstance = null;
}

function showDrilldown(title, bodyHTML, onAfterRender) {
  const panel = document.getElementById("overview-drilldown-panel");
  const titleEl = document.getElementById("drilldown-title");
  const bodyEl = document.getElementById("drilldown-body");
  if (!panel || !titleEl || !bodyEl) return;
  titleEl.textContent = title;
  bodyEl.innerHTML = bodyHTML;
  bodyEl.className = "drilldown-body";
  panel.hidden = false;
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  if (typeof onAfterRender === "function") onAfterRender();
}

function hideDrilldown() {
  const panel = document.getElementById("overview-drilldown-panel");
  if (!panel) return;
  panel.hidden = true;
  const bodyEl = document.getElementById("drilldown-body");
  if (bodyEl) bodyEl.innerHTML = "";
  destroyDrilldownCharts();
}

function buildDrilldownTable(rows, columns, options = {}) {
  if (!rows || rows.length === 0) {
    return '<p class="empty-state">No data available.</p>';
  }
  const codeKey = options.codeKey;
  const thead = columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("");
  const tbody = rows
    .map((row) => {
      const code = codeKey ? row[codeKey] ?? row.material_code ?? row.materialCode : null;
      const tds = columns
        .map((c) => {
          let val = row[c.key] ?? "—";
          if (c.numeric && val !== "—") val = Number(val).toLocaleString("en-IN");
          return `<td>${typeof val === "string" && val.includes("<") ? val : escapeHtml(String(val))}</td>`;
        })
        .join("");
      const clickable = code ? ' class="drilldown-row-clickable" data-code="' + escapeHtml(String(code)) + '"' : "";
      return `<tr${clickable}>${tds}</tr>`;
    })
    .join("");
  return `<div class="drilldown-table-wrap"><table class="drilldown-table"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table></div>`;
}

function bindDrilldownTableRowClicks() {
  const body = document.getElementById("drilldown-body");
  if (!body) return;
  body.querySelectorAll("tr.drilldown-row-clickable[data-code]").forEach((tr) => {
    tr.addEventListener("click", () => {
      const code = tr.dataset.code;
      if (!code) return;
      body.querySelectorAll("tr.drilldown-row-clickable").forEach((r) => r.classList.remove("drilldown-row-selected"));
      tr.classList.add("drilldown-row-selected");
      renderMaterialDrilldownPreview(code);
    });
  });
}

function finishOverviewListDrilldown(firstMaterialCode, summaryBarConfig) {
  if (summaryBarConfig) {
    renderDrilldownSummaryBarChart(
      "drilldown-summary-chart",
      summaryBarConfig.labels,
      summaryBarConfig.values,
      summaryBarConfig.options
    );
  }
  bindDrilldownTableRowClicks();
  if (firstMaterialCode) {
    const body = document.getElementById("drilldown-body");
    body?.querySelectorAll("tr.drilldown-row-clickable").forEach((tr) => {
      if (tr.dataset.code === String(firstMaterialCode)) tr.classList.add("drilldown-row-selected");
    });
    renderMaterialDrilldownPreview(firstMaterialCode);
  }
}

function renderDrilldownSummaryBarChart(canvasId, labels, values, options = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined" || !labels.length) return;
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();
  const ui = chartUiColors();
  const horizontal = options.horizontal !== false;
  new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: options.datasetLabel || "Value",
          data: values,
          backgroundColor: options.colors || "#5B9CF6",
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: horizontal ? "y" : "x",
      plugins: {
        legend: { display: false },
        title: options.title
          ? { display: true, text: options.title, color: ui.text, font: { size: 11 } }
          : { display: false },
      },
      scales: {
        x: { beginAtZero: true, ticks: { color: ui.text, font: { size: 9 } } },
        y: { ticks: { color: ui.text, font: { size: 9 } } },
      },
    },
  });
}

function drilldownListShell(introHtml, tableHtml) {
  return `<div class="drilldown-body drilldown-list-layout">
    <p class="drilldown-list-intro">${introHtml}</p>
    <div class="drilldown-summary-chart-wrap"><canvas id="drilldown-summary-chart"></canvas></div>
    <p class="drilldown-list-hint">Click a row to update charts below, or open full detail with the link under the table.</p>
    ${tableHtml}
    <div id="drilldown-material-detail" class="drilldown-material-detail"></div>
  </div>`;
}

function stockKeyFor(items) {
  return (
    detectKey(items[0], [
      "stockQty",
      "stock_qty",
      "currentStock",
      "current_stock",
      "availableStock",
      "LABST",
    ]) || "stockQty"
  );
}

function populateMaterialsDropdown(items) {
  const ul = document.getElementById("dropdown-materials");
  if (!ul || !items?.length || ul.dataset.populated) return;
  ul.dataset.populated = "1";

  const codeKey = detectKey(items[0], ["materialCode", "material_code", "code", "MATNR"]);
  const nameKey = detectKey(items[0], [
    "itemName",
    "item_name",
    "materialDescription",
    "description",
    "name",
    "material_description",
    "materialName",
  ]);
  window._matCodeKey = codeKey;
  window._matNameKey = nameKey;

  const catKey = detectKey(items[0], ["category", "materialGroup", "material_group", "MATKL"]);
  const listItems = items
    .map((item) => {
      const code = item[codeKey] || "—";
      const name = item[nameKey] || "";
      const cat = item[catKey] ?? item.category ?? "";
      const shortName = name.length > 40 ? `${name.slice(0, 40)}…` : name;
      const search = `${code} ${name} ${cat}`.toLowerCase();
      return `<li class="dropdown-mat-item" data-code="${escapeHtml(String(code))}" data-search="${escapeAttr(search)}" title="${escapeHtml(name)}"><strong>${escapeHtml(String(code))}</strong>${name ? `<br><small style="color:var(--text-muted)">${escapeHtml(shortName)}</small>` : ""}${cat ? `<br><small style="color:var(--text-muted)">${escapeHtml(String(cat))}</small>` : ""}</li>`;
    })
    .join("");

  const searchLi = ul.querySelector("li:first-child");
  searchLi.insertAdjacentHTML("afterend", listItems);

  const searchInput = document.getElementById("search-materials");
  if (searchInput && !searchInput.dataset.bound) {
    searchInput.dataset.bound = "1";
    searchInput.placeholder = "Search code, name, or category…";
    searchInput.addEventListener("input", function () {
      filterDropdownItems(ul, ".dropdown-mat-item", this.value);
    });
  }

  ul.querySelectorAll(".dropdown-mat-item").forEach((li) => {
    li.addEventListener("click", (ev) => {
      ev.stopPropagation();
      showMaterialDrilldown(li.dataset.code);
    });
  });
}

function populateDepartmentsDropdown(items) {
  const ul = document.getElementById("dropdown-departments");
  if (!ul || !items?.length || ul.dataset.populated) return;
  ul.dataset.populated = "1";

  const deptKey = detectKey(items[0], ["department", "dept", "location", "WERKS", "departmentCode"]);
  window._deptKey = deptKey;

  const depts = [...new Set(items.map((i) => itemDepartment(i) || i[deptKey]).filter(Boolean))].sort();
  const listItems = depts
    .map((dept) => `<li class="dropdown-dept-item" data-dept="${escapeHtml(String(dept))}">${escapeHtml(String(dept))}</li>`)
    .join("");

  const searchLi = ul.querySelector("li:first-child");
  searchLi.insertAdjacentHTML("afterend", listItems);

  const deptSearch = document.getElementById("search-departments");
  if (deptSearch && !deptSearch.dataset.bound) {
    deptSearch.dataset.bound = "1";
    deptSearch.addEventListener("input", function () {
      filterDropdownItems(ul, ".dropdown-dept-item", this.value);
    });
  }

  ul.querySelectorAll(".dropdown-dept-item").forEach((li) => {
    li.addEventListener("click", (ev) => {
      ev.stopPropagation();
      showDepartmentDrilldown(li.dataset.dept);
    });
  });
}

function getReorderAlertItems(lowStockItems, inventoryItems) {
  const sample = inventoryItems[0] || lowStockItems[0] || {};
  const codeKey =
    window._matCodeKey || detectKey(sample, ["materialCode", "material_code", "code", "MATNR"]);
  const nameKey =
    window._matNameKey ||
    detectKey(sample, [
      "itemName",
      "item_name",
      "materialDescription",
      "description",
      "name",
      "material_description",
      "materialName",
    ]);
  const stockKey = stockKeyFor(inventoryItems.length ? inventoryItems : lowStockItems.length ? lowStockItems : [{}]);
  const reordKey = detectKey(sample, ["reorderLevel", "reorder_level", "safetyStock", "MINBE"]);

  const invByCode = new Map();
  for (const it of inventoryItems) {
    const code = String(it[codeKey] ?? it.material_code ?? it.materialCode ?? "").trim();
    if (code) invByCode.set(code, it);
  }

  let alerts = (lowStockItems || []).map((ls) => {
    const code = String(ls[codeKey] ?? ls.material_code ?? ls.materialCode ?? "").trim();
    return invByCode.get(code) || ls;
  });

  if (!alerts.length && inventoryItems.length) {
    alerts = inventoryItems.filter((i) => {
      const p = resolveParams(i);
      const stock = Number(i[stockKey] ?? 0);
      return p.alertsEnabled && p.reorder > 0 && stock <= p.reorder;
    });
  }

  return alerts
    .map((item) => {
      const stock = Number(item[stockKey] ?? item.stock_qty ?? item.stockQty ?? 0);
      const reorder = Number(item[reordKey] ?? item.reorder_level ?? item.reorderLevel ?? 0);
      const status = inventoryStatus(item);
      return {
        item,
        code: String(item[codeKey] ?? item.material_code ?? item.materialCode ?? "—"),
        name: String(item[nameKey] ?? item.materialDescription ?? item.description ?? ""),
        stock,
        reorder,
        deficit: Math.max(0, reorder - stock),
        status,
      };
    })
    .sort((a, b) => b.deficit - a.deficit || a.code.localeCompare(b.code));
}

function populateReorderAlertsDropdown(lowStockItems, inventoryItems) {
  const ul = document.getElementById("dropdown-reorder");
  if (!ul) return;

  ul.querySelectorAll(".dropdown-reorder-item").forEach((el) => el.remove());

  const alerts = getReorderAlertItems(lowStockItems, inventoryItems);
  const searchLi = ul.querySelector("li:first-child");
  if (!searchLi) return;

  if (!alerts.length) {
    searchLi.insertAdjacentHTML(
      "afterend",
      '<li class="dropdown-reorder-item dropdown-reorder-empty" style="cursor:default;color:var(--text-muted)">No reorder alerts</li>'
    );
    return;
  }

  const badgeClass = (status) =>
    status === "CRITICAL" ? "badge-critical" : status === "LOW" ? "badge-warning" : "badge-watch";

  const catKey = detectKey(alerts[0]?.item || inventoryItems[0] || {}, [
    "category",
    "materialGroup",
    "material_group",
  ]);
  const listItems = alerts
    .map(({ item, code, name, stock, reorder, deficit, status }) => {
      const shortName = name.length > 36 ? `${name.slice(0, 36)}…` : name;
      const cat = item[catKey] ?? item.category ?? "";
      const search = `${code} ${name} ${cat}`.toLowerCase();
      return `<li class="dropdown-reorder-item" data-code="${escapeHtml(code)}" data-search="${escapeAttr(search)}" title="${escapeHtml(name)}">
        <div class="dropdown-reorder-row">
          <span><strong>${escapeHtml(code)}</strong>${name ? `<br><small class="dropdown-reorder-name">${escapeHtml(shortName)}</small>` : ""}</span>
          <span class="badge ${badgeClass(status)}">${escapeHtml(status)}</span>
        </div>
        <small class="dropdown-reorder-meta">Stock ${formatNumber(stock, 0)} / Reorder ${formatNumber(reorder, 0)} · Gap ${formatNumber(deficit, 0)}</small>
      </li>`;
    })
    .join("");

  searchLi.insertAdjacentHTML("afterend", listItems);

  if (!ul.dataset.searchBound) {
    ul.dataset.searchBound = "1";
    const reorderSearch = document.getElementById("search-reorder");
    reorderSearch?.addEventListener("input", function () {
      filterDropdownItems(ul, ".dropdown-reorder-item:not(.dropdown-reorder-empty)", this.value);
    });
  }

  ul.querySelectorAll(".dropdown-reorder-item:not(.dropdown-reorder-empty)").forEach((li) => {
    li.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (li.dataset.code) showMaterialDrilldown(li.dataset.code);
    });
  });
}

async function renderMaterialDrilldownPreview(materialCode) {
  const host = document.getElementById("drilldown-material-detail");
  if (!host) {
    showMaterialDrilldown(materialCode);
    return;
  }

  const items = window.inventoryData || [];
  const codeKey = window._matCodeKey || "materialCode";
  const nameKey = window._matNameKey || "itemName";
  const resolved = resolveMaterialRow(materialCode);
  const item = resolved?.row;

  const stockKey = item ? stockKeyFor(items.length ? items : [item]) : "stock_qty";
  const reordKey = item ? detectKey(item, ["reorderLevel", "reorder_level", "safetyStock"]) : "reorder_level";
  const stock = item ? Number(item[stockKey] ?? item.stock_qty ?? 0) : 0;
  const reord = item ? Number(item[reordKey] ?? item.reorder_level ?? 0) : 0;
  const name = item ? item[nameKey] ?? item.item_name ?? item.itemName ?? materialCode : materialCode;

  host.innerHTML = `<div class="drilldown-material-preview">
    <h4 class="drilldown-preview-title">📦 ${escapeHtml(materialCode)} — ${escapeHtml(String(name).slice(0, 40))}
      <button type="button" class="btn-link drilldown-open-full" data-code="${escapeHtml(materialCode)}">Full detail →</button>
    </h4>
    <div class="drilldown-preview-charts split-layout">
      <div class="drilldown-chart-wrap drilldown-chart-wrap--sm"><canvas id="drilldown-preview-stock"></canvas></div>
      <div class="drilldown-forecast-chart-wrap"><canvas id="drilldown-preview-forecast"></canvas></div>
    </div>
    <p id="drilldown-preview-forecast-status" class="drilldown-forecast-status">Loading forecast…</p>
  </div>`;

  host.querySelector(".drilldown-open-full")?.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    void showMaterialDrilldown(materialCode);
  });

  if (typeof Chart !== "undefined") {
    document.querySelectorAll("#drilldown-material-detail canvas").forEach((canvas) => {
      const chart = Chart.getChart(canvas);
      if (chart) chart.destroy();
    });
  }

  const ctxStock = document.getElementById("drilldown-preview-stock");
  if (ctxStock && typeof Chart !== "undefined") {
    new Chart(ctxStock, {
      type: "bar",
      data: {
        labels: ["Current Stock", "Reorder Level"],
        datasets: [
          {
            data: [stock, reord],
            backgroundColor: [stock <= reord ? "#EF4444" : "#5B9CF6", "#F9A26C"],
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: { display: true, text: "Stock vs Reorder", color: chartUiColors().text, font: { size: 11 } },
        },
        scales: { y: { beginAtZero: true } },
      },
    });
  }

  const statusEl = document.getElementById("drilldown-preview-forecast-status");
  try {
    const horizon = 30;
    const [forecastData, chartData] = await Promise.all([
      api(`/api/forecast/${encodeURIComponent(materialCode)}?horizon=${horizon}`),
      api(`/api/charts/consumption-trend/${encodeURIComponent(materialCode)}`).catch(() => ({
        labels: [],
        datasets: [{ data: [] }],
      })),
    ]);
    const rows = forecastData.forecast ?? [];
    const chartPayload = buildMonthlyForecastChartData(
      chartData.labels || [],
      chartData.datasets?.[0]?.data || [],
      rows
    );
    const ctxFc = document.getElementById("drilldown-preview-forecast");
    if (ctxFc && chartPayload.labels.length && typeof Chart !== "undefined") {
      const ui = chartUiColors();
      new Chart(ctxFc, {
        type: "line",
        data: {
          labels: chartPayload.labels,
          datasets: [
            {
              label: "Actual (kg/mo)",
              data: chartPayload.actuals,
              borderColor: PALETTE[2],
              borderWidth: 2,
              tension: 0.25,
              spanGaps: false,
              pointRadius: 2,
            },
            {
              label: "Forecast (kg/mo)",
              data: chartPayload.forecast,
              borderColor: "#2E7CF6",
              borderWidth: 2.5,
              tension: 0.25,
              spanGaps: false,
              pointRadius: 4,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom", labels: { color: ui.text, font: { size: 9 } } } },
          scales: {
            y: { beginAtZero: true, title: { display: true, text: "kg / month", color: ui.text, font: { size: 9 } } },
          },
        },
      });
      const totalForecast = rows.reduce((s, r) => s + Number(r.yhat ?? 0), 0);
      if (statusEl) {
        statusEl.textContent = `Forecast total (${horizon}d): ${Math.round(totalForecast).toLocaleString("en-IN")} kg`;
        if (totalForecast > stock) {
          statusEl.innerHTML += ' — <span style="color:#EF4444;font-weight:600">⚠ Stockout risk</span>';
        }
      }
    } else if (statusEl) {
      statusEl.textContent = "No forecast data for this material.";
    }
  } catch (e) {
    if (statusEl) statusEl.textContent = "Forecast unavailable.";
    console.warn("[DRILLDOWN] preview forecast failed:", e);
  }
}

function forecastHorizonLabel(days) {
  const d = Number(days) || 30;
  if (d >= 90) return "3 months";
  if (d >= 60) return "2 months";
  return "1 month";
}

async function loadDrilldownFullForecast(materialCode, horizon = 30, options = {}) {
  const code = String(materialCode ?? "").trim();
  const stock = Number(options.stock ?? 0);
  const statusEl = document.getElementById("drilldown-forecast-status");
  const ctx2 = document.getElementById("drilldown-chart-forecast");
  if (!ctx2) return;

  if (statusEl) statusEl.textContent = "Loading forecast…";
  if (typeof Chart !== "undefined") {
    const existing = Chart.getChart(ctx2);
    if (existing) existing.destroy();
  }

  try {
    const [forecastData, chartData] = await Promise.all([
      api(`/api/forecast/${encodeURIComponent(code)}?horizon=${horizon}`),
      api(`/api/charts/consumption-trend/${encodeURIComponent(code)}`).catch(() => ({
        labels: [],
        datasets: [{ data: [] }],
      })),
    ]);
    const rows = forecastData.forecast ?? (Array.isArray(forecastData) ? forecastData : []);
    const histLabels = chartData.labels || [];
    const histData = chartData.datasets?.[0]?.data || [];
    const chartPayload = buildMonthlyForecastChartData(histLabels, histData, rows);

    if (chartPayload.labels.length && typeof Chart !== "undefined") {
      const ui = chartUiColors();
      window.drilldownForecastChartInstance = new Chart(ctx2, {
        type: "line",
        data: {
          labels: chartPayload.labels,
          datasets: [
            {
              label: "Actual (kg/mo)",
              data: chartPayload.actuals,
              borderColor: PALETTE[2],
              backgroundColor: "transparent",
              borderWidth: 2,
              tension: 0.25,
              spanGaps: false,
              pointRadius: 2,
              pointHoverRadius: 4,
              order: 1,
            },
            {
              label: "Forecast (kg/mo)",
              data: chartPayload.forecast,
              borderColor: "#2E7CF6",
              backgroundColor: "transparent",
              borderWidth: 2.5,
              tension: 0.25,
              spanGaps: false,
              pointRadius: 4,
              pointHoverRadius: 5,
              order: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: {
              display: true,
              position: "bottom",
              labels: { color: ui.text, boxWidth: 10, font: { size: 10 } },
            },
            tooltip: {
              callbacks: {
                label(ctx) {
                  const v = ctx.parsed.y;
                  if (v == null || Number.isNaN(v)) return `${ctx.dataset.label}: —`;
                  return `${ctx.dataset.label}: ${formatNumber(v, 0)} kg`;
                },
              },
            },
          },
          scales: {
            x: { ticks: { maxTicksLimit: 10, font: { size: 10 }, color: ui.text } },
            y: {
              beginAtZero: true,
              ticks: { color: ui.text, font: { size: 10 } },
              title: { display: true, text: "kg / month", color: ui.text, font: { size: 10 } },
            },
          },
        },
      });
      const totalForecast = rows.map((r) => Number(r.yhat ?? 0)).reduce((s, v) => s + v, 0);
      if (statusEl) {
        const method = forecastData.forecast_method
          ? ` · ${FORECAST_METHOD_LABELS[forecastData.forecast_method] || forecastData.forecast_method}`
          : "";
        statusEl.textContent = `Forecast total (${forecastHorizonLabel(horizon)}): ${Math.round(totalForecast).toLocaleString("en-IN")} kg${method}`;
        if (totalForecast > stock) {
          statusEl.innerHTML += ' — <span style="color:#EF4444;font-weight:600">⚠ Stockout risk</span>';
        }
      }
    } else if (statusEl) {
      statusEl.textContent = "No forecast data for this material.";
    }
  } catch (e) {
    if (statusEl) statusEl.textContent = "Forecast unavailable for this material.";
    console.warn("[DRILLDOWN] forecast fetch failed:", e);
  }
}

function bindDrilldownHorizonButtons(materialCode, stock) {
  const host = document.getElementById("drilldown-body");
  if (!host) return;
  host.querySelectorAll(".drilldown-horizon-btn").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const horizon = Number(btn.dataset.horizon) || 30;
      host.querySelectorAll(".drilldown-horizon-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      void loadDrilldownFullForecast(materialCode, horizon, { stock });
    });
  });
}

async function showMaterialDrilldown(materialCode) {
  const code = String(materialCode ?? "").trim();
  if (!code) return;
  const resolved = resolveMaterialRow(code);
  if (!resolved) {
    showDrilldown(`Material: ${code}`, '<p class="empty-state">Material not found in loaded data.</p>');
    return;
  }
  const { row: item, codeKey } = resolved;
  const nameKey = window._matNameKey || "itemName";
  const items = window.inventoryData || [];

  const deptKey = detectKey(item, ["department", "dept", "location", "WERKS"]);
  const catKey = detectKey(item, ["category", "materialGroup", "material_group", "MATKL"]);
  const stockKey = stockKeyFor(items.length ? items : [item]);
  const reordKey = detectKey(item, ["reorderLevel", "reorder_level", "safetyStock", "MINBE"]);
  const costKey = detectKey(item, ["unitCost", "unit_cost", "STPRS"]);
  const valKey = detectKey(item, ["stockValue", "stock_value", "totalValue"]);
  const unitKey = detectKey(item, ["unit", "unitOfMeasure", "MEINS"]);

  const name = item[nameKey] ?? item.item_name ?? item.itemName ?? item.material_description ?? code;
  const stock = Number(item[stockKey] ?? item.stock_qty ?? item.stockQty ?? 0);
  const reord = Number(item[reordKey] ?? item.reorder_level ?? 0);
  const cost = Number(item[costKey] ?? 0);

  let statusBadge = '<span class="badge badge-safe">OK</span>';
  if (stock === 0) statusBadge = '<span class="badge badge-zero">ZERO STOCK</span>';
  else {
    const st = inventoryStatus(item);
    if (st === "CRITICAL") statusBadge = '<span class="badge badge-critical">CRITICAL</span>';
    else if (st === "LOW") statusBadge = '<span class="badge badge-warning">LOW</span>';
  }

  const detailRows = [
    { field: "Material Code", value: code },
    { field: "Description", value: name },
    { field: "Department", value: item[deptKey] ?? itemDepartment(item) ?? "—" },
    { field: "Category", value: item[catKey] ?? "—" },
    { field: "Current Stock", value: `${stock.toLocaleString("en-IN")} ${item[unitKey] ?? item.unit ?? ""}`.trim() },
    { field: "Reorder Level", value: reord.toLocaleString("en-IN") },
    { field: "Unit Cost (₹)", value: `₹${cost.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` },
    {
      field: "Stock Value (₹)",
      value: `₹${(valKey ? Number(item[valKey]) : stock * cost).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
    },
    { field: "Status", value: statusBadge },
  ];

  const tableHTML = `<div class="drilldown-table-wrap"><table class="drilldown-table"><thead><tr><th>Field</th><th>Value</th></tr></thead><tbody>${detailRows.map((r) => `<tr><td><strong>${escapeHtml(r.field)}</strong></td><td>${typeof r.value === "string" && r.value.includes("<") ? r.value : escapeHtml(String(r.value))}</td></tr>`).join("")}</tbody></table></div>`;
  const chartHTML = '<div class="drilldown-chart-wrap"><canvas id="drilldown-chart-material"></canvas></div>';
  const forecastHTML = `<div class="drilldown-material-forecast" data-material-code="${escapeHtml(code)}">
    <div class="drilldown-forecast-toolbar">
      <h4 class="drilldown-forecast-heading">Monthly consumption — history &amp; forecast</h4>
      <div class="horizon-btns drilldown-horizon-btns" role="group" aria-label="Forecast horizon">
        <button type="button" class="horizon-btn drilldown-horizon-btn active" data-horizon="30">1 mo</button>
        <button type="button" class="horizon-btn drilldown-horizon-btn" data-horizon="60">2 mo</button>
        <button type="button" class="horizon-btn drilldown-horizon-btn" data-horizon="90">3 mo</button>
      </div>
    </div>
    <div class="drilldown-forecast-chart-wrap"><canvas id="drilldown-chart-forecast"></canvas></div>
    <p id="drilldown-forecast-status" class="drilldown-forecast-status">Loading forecast…</p>
  </div>`;

  showDrilldown(
    `📦 ${code} — ${String(name).slice(0, 50)}`,
    `<div class="drilldown-body drilldown-material-layout"><div class="drilldown-material-top split-layout">${tableHTML}<div class="drilldown-material-charts">${chartHTML}</div></div>${forecastHTML}</div>`,
    async () => {
      destroyDrilldownCharts();
      const ctx1 = document.getElementById("drilldown-chart-material");
      if (ctx1 && typeof Chart !== "undefined") {
        window.drilldownChartInstance = new Chart(ctx1, {
          type: "bar",
          data: {
            labels: ["Current Stock", "Reorder Level"],
            datasets: [{ data: [stock, reord], backgroundColor: [stock <= reord ? "#EF4444" : "#5B9CF6", "#F9A26C"], borderRadius: 6 }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, title: { display: true, text: "Stock vs Reorder Level", color: chartUiColors().text, font: { size: 12 } } },
            scales: { y: { beginAtZero: true } },
          },
        });
      }

      bindDrilldownHorizonButtons(code, stock);
      await loadDrilldownFullForecast(code, 30, { stock });
    }
  );
}

function renderDepartmentStockChart(deptItems, codeKey, stockKey, reordKey, selectedCode, titleEl) {
  const canvas = document.getElementById("drilldown-chart-dept-stock");
  if (!canvas || typeof Chart === "undefined") return;

  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();

  const colors = chartUiColors();
  let chartTitle;

  if (selectedCode) {
    const item = deptItems.find(
      (i) => String(i[codeKey] ?? i.material_code ?? i.materialCode).trim() === String(selectedCode).trim()
    );
    if (!item) return;
    const stock = Number(item[stockKey] ?? 0);
    const reord = Number(item[reordKey] ?? 0);
    chartTitle = `Stock vs Reorder — ${selectedCode}`;
    window.drilldownChartInstance = new Chart(canvas, {
      type: "bar",
      data: {
        labels: ["Current Stock", "Reorder Level"],
        datasets: [
          {
            label: "Quantity",
            data: [stock, reord],
            backgroundColor: [stock <= reord && reord > 0 ? "#EF4444" : "#5B9CF6", "#F06B8A"],
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: { display: true, text: chartTitle, color: colors.text, font: { size: 12 } },
        },
        scales: {
          y: { beginAtZero: true, ticks: { color: colors.text }, grid: { color: colors.grid } },
          x: { ticks: { color: colors.text }, grid: { display: false } },
        },
      },
    });
  } else {
    const sorted = [...deptItems].sort((a, b) => Number(b[stockKey] ?? 0) - Number(a[stockKey] ?? 0));
    const slice = sorted.slice(0, Math.min(sorted.length, 10));
    const labels = slice.map((i) => {
      const code = String(i[codeKey] ?? "");
      return code.length > 10 ? code.slice(-8) : code;
    });
    chartTitle =
      slice.length < sorted.length
        ? `Stock vs Reorder (top ${slice.length} of ${sorted.length})`
        : "Stock vs Reorder — all materials";
    window.drilldownChartInstance = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Current Stock", data: slice.map((i) => Number(i[stockKey] ?? 0)), backgroundColor: "#5B9CF6", borderRadius: 4 },
          { label: "Reorder Level", data: slice.map((i) => Number(i[reordKey] ?? 0)), backgroundColor: "#F06B8A", borderRadius: 4 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { font: { size: 10 }, color: colors.text } },
          title: { display: true, text: chartTitle, color: colors.text, font: { size: 12 } },
        },
        scales: {
          x: { ticks: { font: { size: 9 }, maxRotation: 45, color: colors.text }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: colors.text }, grid: { color: colors.grid } },
        },
      },
    });
  }

  if (titleEl) titleEl.textContent = chartTitle;
}

function showDepartmentDrilldown(dept) {
  const items = window.inventoryData || [];
  const deptKey = window._deptKey || "department";
  const codeKey = window._matCodeKey || "materialCode";
  const nameKey = window._matNameKey || "itemName";
  const deptItems = items.filter((i) => String(itemDepartment(i) || i[deptKey] || "").trim() === String(dept).trim());

  if (!deptItems.length) {
    showDrilldown(`Department: ${dept}`, '<p class="empty-state">No materials found for this department.</p>');
    return;
  }

  const catKey = detectKey(deptItems[0], ["category", "materialGroup", "material_group", "MATKL"]);
  const stockKey = stockKeyFor(deptItems);
  const reordKey = detectKey(deptItems[0], ["reorderLevel", "reorder_level", "safetyStock"]);
  const valKey = detectKey(deptItems[0], ["stockValue", "stock_value"]);

  const totalValue = deptItems.reduce((s, i) => s + Number(i[valKey] ?? stockValue(i) ?? 0), 0);
  const critCount = deptItems.filter((i) => Number(i[stockKey] ?? 0) <= Number(i[reordKey] ?? 0) && Number(i[reordKey] ?? 0) > 0).length;

  const columns = [
    { key: codeKey, label: "Material Code" },
    { key: nameKey, label: "Description" },
    { key: catKey, label: "Category" },
    { key: stockKey, label: "Stock", numeric: true },
    { key: reordKey, label: "Reorder", numeric: true },
  ].filter((c) => c.key);

  const materialOptions = [...deptItems]
    .sort((a, b) => String(a[codeKey] ?? "").localeCompare(String(b[codeKey] ?? "")))
    .map((item) => {
      const code = item[codeKey] ?? item.material_code ?? item.materialCode ?? "";
      const name = item[nameKey] ?? item.item_name ?? item.itemName ?? "";
      const cat = item[catKey] ?? item.category ?? "";
      const label = name ? `${code} — ${name}` : code;
      const search = `${code} ${name} ${cat}`.toLowerCase();
      return `<option value="${escapeHtml(String(code))}" data-search="${escapeAttr(search)}">${escapeHtml(label.length > 72 ? `${label.slice(0, 70)}…` : label)}</option>`;
    })
    .join("");

  const summaryHTML = `<p class="drilldown-dept-summary">${deptItems.length} materials · Stock value: ₹${totalValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })} · Critical: ${critCount}</p>`;
  const controlsHTML = `<div class="drilldown-dept-controls"><label class="drilldown-dept-label" for="drilldown-dept-material">Focus material</label><select id="drilldown-dept-material" class="drilldown-material-select"><option value="">All materials (comparison)</option>${materialOptions}</select></div>`;
  const tableHTML = buildDrilldownTable(deptItems, columns);
  const chartSectionHTML = `<div class="drilldown-dept-chart-section"><h4 id="drilldown-dept-chart-title" class="drilldown-dept-chart-title">Stock vs Reorder</h4><div class="drilldown-chart-wrap drilldown-chart-wrap--dept"><canvas id="drilldown-chart-dept-stock"></canvas></div></div>`;

  showDrilldown(
    `🏭 Department: ${dept} (${deptItems.length} materials)`,
    `<div class="drilldown-body drilldown-dept-layout">${summaryHTML}${controlsHTML}${tableHTML}${chartSectionHTML}</div>`,
    () => {
      destroyDrilldownCharts();
      const select = document.getElementById("drilldown-dept-material");
      const titleEl = document.getElementById("drilldown-dept-chart-title");
      const tbody = document.querySelector("#overview-drilldown-panel .drilldown-table tbody");

      function highlightTableRow(code) {
        if (!tbody) return;
        tbody.querySelectorAll("tr").forEach((tr) => tr.classList.remove("drilldown-row-selected"));
        if (!code) return;
        const rows = tbody.querySelectorAll("tr");
        deptItems.forEach((item, idx) => {
          const itemCode = String(item[codeKey] ?? item.material_code ?? item.materialCode ?? "").trim();
          if (itemCode === String(code).trim() && rows[idx]) rows[idx].classList.add("drilldown-row-selected");
        });
      }

      function onMaterialChange() {
        const code = select?.value || "";
        renderDepartmentStockChart(deptItems, codeKey, stockKey, reordKey, code, titleEl);
        highlightTableRow(code);
      }

      enhanceSearchableSelect(select);
      select?.addEventListener("change", onMaterialChange);
      onMaterialChange();
    }
  );
}

function showCriticalDrilldown() {
  const items = window.inventoryData || [];
  if (!items.length) {
    showDrilldown("⚠ Critical Items", '<p class="empty-state">No inventory data loaded.</p>');
    return;
  }
  const codeKey = window._matCodeKey || detectKey(items[0], ["materialCode", "material_code"]);
  const nameKey = window._matNameKey || detectKey(items[0], ["itemName", "item_name"]);
  const stockKey = stockKeyFor(items);
  const reordKey = detectKey(items[0], ["reorderLevel", "reorder_level", "safetyStock"]);
  const catKey = detectKey(items[0], ["category", "materialGroup", "MATKL"]);
  const deptKey = detectKey(items[0], ["department", "dept", "location", "WERKS"]);

  const critItems = items
    .filter((i) => Number(i[stockKey] ?? 0) <= Number(i[reordKey] ?? 0) && Number(i[reordKey] ?? 0) > 0)
    .sort((a, b) => {
      const gapA = Number(a[stockKey] ?? 0) - Number(a[reordKey] ?? 0);
      const gapB = Number(b[stockKey] ?? 0) - Number(b[reordKey] ?? 0);
      return gapA - gapB;
    });

  if (!critItems.length) {
    showDrilldown("⚠ Critical Items", '<p style="color:#22c55e;font-weight:600">✅ No critical items found.</p>');
    return;
  }

  if (critItems.length === 1) {
    showMaterialDrilldown(String(critItems[0][codeKey] ?? critItems[0].material_code ?? ""));
    return;
  }

  const rowsWithDeficit = critItems.map((i) => ({ ...i, _deficit: Number(i[reordKey] ?? 0) - Number(i[stockKey] ?? 0) }));
  window._drilldownContextRows = rowsWithDeficit;
  const columns = [
    { key: codeKey, label: "Material Code" },
    { key: nameKey, label: "Description" },
    { key: deptKey, label: "Department" },
    { key: catKey, label: "Category" },
    { key: stockKey, label: "Current Stock", numeric: true },
    { key: reordKey, label: "Reorder Level", numeric: true },
    { key: "_deficit", label: "Deficit", numeric: true },
  ].filter((c) => c.key);

  const top = rowsWithDeficit.slice(0, 10);
  showDrilldown(
    `⚠ Critical Items (${critItems.length})`,
    drilldownListShell(
      "Items where current stock ≤ reorder level (top 10 deficits below).",
      buildDrilldownTable(rowsWithDeficit, columns, { codeKey })
    ),
    () => {
      const firstCode = String(critItems[0][codeKey] ?? critItems[0].material_code ?? "");
      finishOverviewListDrilldown(firstCode, {
        labels: top.map((r) => String(r[codeKey] ?? "").slice(-8)),
        values: top.map((r) => r._deficit),
        options: { title: "Stock deficit (top 10)", datasetLabel: "Deficit", colors: "#EF4444" },
      });
    }
  );
}

async function showForecastedShortagesDrilldown() {
  showDrilldown("🔮 Forecasted Shortages", '<p style="color:var(--text-muted)">Loading forecast data…</p>');
  try {
    const critical = unwrapCritical(await api("/api/forecast/critical"));
    if (!critical.length) {
      showDrilldown("🔮 Forecasted Shortages", '<p style="color:#22c55e;font-weight:600">✅ No forecasted shortages.</p>');
      return;
    }
    const fc0 = critical[0];
    const codeKey = detectKey(fc0, ["materialCode", "material_code", "code"]) || "material_code";
    if (critical.length === 1) {
      showMaterialDrilldown(String(fc0[codeKey] ?? ""));
      return;
    }
    const nameKey = detectKey(fc0, ["materialDescription", "description", "name", "materialName", "itemName", "item_name"]);
    const catKey = detectKey(fc0, ["category", "materialGroup"]);
    const today = new Date();
    const enriched = critical
      .map((i) => {
        const dtzRaw = rowDaysToZero(i);
        const dtz = dtzRaw != null ? dtzRaw : 999;
        const stockoutDate = new Date(today);
        stockoutDate.setDate(today.getDate() + Math.round(dtz));
        return {
          ...i,
          _daysToZero: dtz,
          _stockoutDate:
            dtzRaw != null
              ? stockoutDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
              : "—",
          _urgency: (() => {
            const p = resolveParams(i);
            if (dtzRaw == null) return "🟡 WATCH";
            if (dtz <= p.urgentDays) return "🔴 URGENT";
            if (dtz <= p.warningDays) return "🟠 WARNING";
            return "🟡 WATCH";
          })(),
        };
      })
      .sort((a, b) => a._daysToZero - b._daysToZero);

    const columns = [
      { key: codeKey, label: "Material Code" },
      { key: nameKey, label: "Description" },
      { key: catKey, label: "Category" },
      { key: "_daysToZero", label: "Days to Zero", numeric: true },
      { key: "_stockoutDate", label: "Stockout Date" },
      { key: "_urgency", label: "Urgency" },
    ].filter((c) => c.key);

    const top = enriched.slice(0, 10);
    window._drilldownContextRows = enriched;
    showDrilldown(
      `🔮 Forecasted Shortages (${enriched.length})`,
      drilldownListShell(
        "Sorted by days to stockout. Items with fewer days are most urgent.",
        buildDrilldownTable(enriched, columns, { codeKey })
      ),
      () => {
        const firstCode = String(enriched[0][codeKey] ?? "");
        finishOverviewListDrilldown(firstCode, {
          labels: top.map((i) => String(i[codeKey] ?? "").slice(-8)),
          values: top.map((i) => Number(i._daysToZero ?? 0)),
          options: { title: "Days to stockout (top 10)", datasetLabel: "Days", colors: "rgba(249, 162, 108, 0.85)" },
        });
      }
    );
  } catch (e) {
    showDrilldown("🔮 Forecasted Shortages", '<p class="empty-state">Could not load forecast data. Check that Flask/Prophet service is running.</p>');
    console.error("[F4] forecast/critical error:", e);
  }
}

function showZeroStockDrilldown() {
  const items = window.inventoryData || [];
  const codeKey = window._matCodeKey || "materialCode";
  const nameKey = window._matNameKey || "itemName";
  const stockKey = stockKeyFor(items.length ? items : [{}]);
  const reordKey = detectKey(items[0], ["reorderLevel", "reorder_level"]);
  const catKey = detectKey(items[0], ["category", "materialGroup"]);
  const deptKey = detectKey(items[0], ["department", "dept", "location"]);
  const costKey = detectKey(items[0], ["unitCost", "unit_cost"]);

  const zeroItems = items
    .filter((i) => Number(i[stockKey] ?? 0) === 0)
    .map((i) => ({
      ...i,
      _missedValue: `₹${(Number(i[reordKey] ?? 0) * Number(i[costKey] ?? 0)).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
    }));

  if (!zeroItems.length) {
    showDrilldown("🔴 Items at Zero Stock", '<p style="color:#22c55e;font-weight:600">✅ No items at zero stock.</p>');
    return;
  }

  if (zeroItems.length === 1) {
    showMaterialDrilldown(String(zeroItems[0][codeKey] ?? zeroItems[0].material_code ?? ""));
    return;
  }

  const columns = [
    { key: codeKey, label: "Material Code" },
    { key: nameKey, label: "Description" },
    { key: deptKey, label: "Department" },
    { key: catKey, label: "Category" },
    { key: reordKey, label: "Reorder Level", numeric: true },
    { key: "_missedValue", label: "Est. Value Gap" },
  ].filter((c) => c.key);

  const top = zeroItems.slice(0, 10);
  window._drilldownContextRows = zeroItems;
  showDrilldown(
    `🔴 Items at Zero Stock (${zeroItems.length})`,
    drilldownListShell(
      '<span style="color:#e53935;font-weight:600">⚠ These items have no stock. Immediate procurement action recommended.</span>',
      buildDrilldownTable(zeroItems, columns, { codeKey })
    ),
    () => {
      const firstCode = String(zeroItems[0][codeKey] ?? zeroItems[0].material_code ?? "");
      finishOverviewListDrilldown(firstCode, {
        labels: top.map((i) => String(i[codeKey] ?? "").slice(-8)),
        values: top.map((i) => Number(i[reordKey] ?? 0)),
        options: { title: "Reorder level (top 10)", datasetLabel: "Reorder", colors: "rgba(229, 57, 53, 0.7)" },
      });
    }
  );
}

function bindOverviewDrilldown() {
  if (document.body.dataset.drilldownBound) return;
  document.body.dataset.drilldownBound = "1";
  document.getElementById("drilldown-close")?.addEventListener("click", hideDrilldown);
  document.getElementById("tile-critical-items")?.addEventListener("click", showCriticalDrilldown);
  document.getElementById("tile-forecast-shortages")?.addEventListener("click", showForecastedShortagesDrilldown);
  document.getElementById("tile-zero-stock")?.addEventListener("click", showZeroStockDrilldown);

  document.getElementById("drilldown-body")?.addEventListener("click", (e) => {
    const btn = e.target.closest?.(".drilldown-open-full");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const matCode = btn.dataset.code;
    if (matCode) void showMaterialDrilldown(matCode);
  });

  document.addEventListener("click", (e) => {
    const panel = document.getElementById("overview-drilldown-panel");
    const tiles = document.querySelectorAll(
      "#tile-total-materials, #tile-total-depts, #tile-critical-items, #tile-forecast-shortages, #tile-zero-stock"
    );
    if (panel && !panel.hidden) {
      if (e.target.closest?.(".drilldown-open-full, #drilldown-close")) return;
      const path = typeof e.composedPath === "function" ? e.composedPath() : [];
      const clickedTile = [...tiles].some((t) => t.contains(e.target));
      const clickedPanel = panel.contains(e.target) || path.includes(panel);
      if (!clickedTile && !clickedPanel) hideDrilldown();
    }
  });
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
    const cat = it.category ?? "";
    const dept = itemDepartment(it) ?? "";
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = `${code} — ${name}`.length > 60 ? code : `${code} — ${name}`;
    opt.dataset.search = `${code} ${name} ${cat} ${dept}`.toLowerCase();
    select.appendChild(opt);
  }
  if (current && [...select.options].some((o) => o.value === current)) {
    select.value = current;
  }
  refreshSearchableSelect(select);
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
    const el = document.getElementById(id);
    fillSelectOptions(el, items, true);
    if (el) enhanceSearchableSelect(el);
  }
}

const VALID_PAGES = ["overview", "charts", "inventory", "critical", "forecast", "parameters"];

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
    case "parameters":
      loadParametersPage();
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
    console.log(
      "[DRILLDOWN] inventory keys:",
      window.inventoryData?.[0] ? Object.keys(window.inventoryData[0]) : "not found"
    );
    populateMaterialsDropdown(window.inventoryData);
    populateDepartmentsDropdown(window.inventoryData);
    populateMaterialSelects(items);

    const lowItems = lowStock.critical ?? lowStock.items ?? [];

    const departments = new Set(items.map((it) => itemDepartment(it)).filter(Boolean));
    const zeroStock = items.filter((it) => Number(it.stockQty ?? it.stock_qty ?? 0) === 0).length;
    const criticalRows = unwrapCritical(criticalForecast);
    consumptionRateByCode.clear();
    for (const it of items) {
      const code = it.materialCode ?? it.material_code;
      const rate = Number(it.avgDailyConsumption ?? it.avg_daily_consumption ?? 0);
      if (code && rate > 0) consumptionRateByCode.set(code, rate);
    }
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
      const defaultWarning = PARAM_DEFAULTS.warningDays;
      const shortageCount = dtzKey
        ? criticalRows.filter((row) => {
            const code = row.materialCode ?? row.material_code ?? row.code ?? "";
            const inv = items.find((it) => (it.materialCode ?? it.material_code) === code);
            const warnDays = inv ? resolveParams(inv).warningDays : defaultWarning;
            return Number(row[dtzKey]) <= warnDays;
          }).length
        : criticalRows.length;
      setKpiValue("kpi-forecast-shortages", formatNumber(shortageCount, 0));
      console.log("[O5] forecasted shortages:", shortageCount, "dtzKey:", dtzKey);
    } catch (e) {
      setKpiValue("kpi-forecast-shortages", "—");
    }

    document.getElementById("qk-reorder").textContent = formatNumber(
      summary.low_stock_count ?? summary.lowStockCount ?? lowItems.length,
      0
    );

    populateReorderAlertsDropdown(lowItems, items);

    renderTopConsumedTable(items, rateKey, nameKey);
    renderTopStockoutTable(criticalRows);
    const overstock = items.filter((it) => {
      const stock = Number(it.stockQty ?? it.stock_qty ?? 0);
      const p = resolveParams(it);
      return p.alertsEnabled && p.reorder > 0 && stock > p.reorder * p.overstockMultiplier;
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
          `<div class="alert-banner warning overstock-tile">🟠 Overstock warnings: ${overstock.length} items above configured overstock multiplier</div>`
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
        const clickable =
          code && code !== "—"
            ? ` class="insight-row-clickable" data-code="${escapeHtml(String(code))}" title="View charts"`
            : "";
        return `<tr${clickable}><td>${escapeHtml(code)}</td><td>${escapeHtml(name || "—")}</td><td style="color:var(--alert-red)">${escapeHtml(days)}</td></tr>`;
      })
      .join("");
    tbody.querySelectorAll(".insight-row-clickable").forEach((tr) => {
      tr.addEventListener("click", () => {
        if (tr.dataset.code) showMaterialDrilldown(tr.dataset.code);
      });
    });
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
        opt.dataset.search = String(value).toLowerCase();
        select.appendChild(opt);
      }
      select.dataset.filled = "1";
      enhanceSearchableSelect(select);
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
        ${tipSourceCell(code)}
        ${tipSourceCell(name)}
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
  requestAnimationFrame(() => applyOverflowTooltips(tbody));
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
        ${tipSourceCell(row.code)}
        ${tipSourceCell(row.name)}
        <td>${escapeHtml(row.category)}</td>
        <td class="num">${formatNumber(row.stock, 2)}</td>
        <td class="num">${formatNumber(row.safetyStock ?? row.reorder, 2)}</td>
        <td class="num">${row.daysToZero == null ? "—" : formatNumber(row.daysToZero, 1)}</td>
        <td>${escapeHtml(row.stockoutDate)}</td>
        <td class="num">${formatNumber(row.suggestedQty, 0)}</td>
        <td><span class="${row.severityClass}">${row.severityLabel}</span></td>
      </tr>`;
    })
    .join("");
  requestAnimationFrame(() => applyOverflowTooltips(tbody));
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
      const suggestedQty = suggestedReorderQty(stock, reorder, item);
      const sev = severityForItem(daysToZero, stock, item);
      const p = resolveParams(item);
      return {
        code,
        name: item.itemName ?? item.item_name ?? "",
        category: item.category ?? "",
        stock,
        reorder,
        safetyStock: p.safetyStock,
        unitCost: Number(item.unitCost ?? item.unit_cost ?? 0),
        daysToZero,
        stockoutDate: daysToZero != null ? formatDate(stockout) : "—",
        suggestedQty,
        severityLabel: sev.label,
        severityClass: sev.className,
        severityKey: sev.key,
        gap: Math.max(0, reorder - stock),
      };
    });

    console.log("[CR1] merged sample:", merged.slice(0, 3));
    console.log(
      "[CR1] items with daysToZero:",
      merged.filter((row) => row.daysToZero !== null).length
    );

    merged.sort((a, b) => {
      const pa = resolveParams(
        lowStock.find((i) => (i.materialCode ?? i.material_code) === a.code) || {}
      );
      const pb = resolveParams(
        lowStock.find((i) => (i.materialCode ?? i.material_code) === b.code) || {}
      );
      if (pb.priority !== pa.priority) return pb.priority - pa.priority;
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

const FORECAST_METHOD_LABELS = {
  prophet_stable: "Prophet — Stable",
  prophet_trending: "Prophet — Trending",
  prophet_seasonal: "Prophet — Seasonal",
  prophet_default: "Prophet — Default",
  croston: "Croston — Intermittent",
  moving_average: "Moving Average",
};

function updateForecastMethodBadge(forecastMethod, materialCategory) {
  const badge = document.getElementById("forecast-method-badge");
  if (!badge) return;
  const method = forecastMethod || "";
  const category = materialCategory || "";
  const text =
    FORECAST_METHOD_LABELS[method] ||
    (method ? method.replace(/_/g, " ") : "") ||
    (category ? category.replace(/_/g, " ") : "");
  if (text) {
    badge.textContent = text;
    badge.hidden = false;
    badge.title = category ? `Pattern: ${category}` : "";
  } else {
    badge.textContent = "";
    badge.hidden = true;
    badge.removeAttribute("title");
  }
}

function setForecastMeta(code, horizon) {
  const meta = document.getElementById("forecast-meta");
  if (!meta) return;
  const name = code ? materialNameByCode.get(code) || "" : "";
  meta.textContent = code
    ? `${name ? `${name} · ` : ""}${code} · horizon ${horizon} days`
    : "";
  if (!code) updateForecastMethodBadge(null, null);
}

function updateForecastStats(rows, horizonDays = 30) {
  const yhat = rows.map((r) => Number(r.yhat ?? 0));
  if (!yhat.length) return;
  const total = yhat.reduce((a, b) => a + b, 0);
  const avgMonthly = total / yhat.length;
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
  document.getElementById("fs-avg").textContent = formatNumber(avgMonthly, 2);
  document.getElementById("fs-peak").textContent = `${formatNumber(peak, 2)} (${formatMonthLabel(peakDate)})`;
  document.getElementById("fs-low").textContent = `${formatNumber(low, 2)} (${formatMonthLabel(lowDate)})`;
  document.getElementById("fs-total").textContent = formatNumber(total, 2);
}

function updateProcurementBox(materialCode, rows, currentStock, horizonDays = 30) {
  const box = document.getElementById("procurement-box");
  if (!box) return;
  const item =
    (window.inventoryData || []).find(
      (it) => (it.materialCode ?? it.material_code) === materialCode
    ) || {};
  const p = resolveParams(item);
  const yhat = rows.map((r) => Number(r.yhat ?? 0));
  const total = yhat.reduce((a, b) => a + b, 0);
  const avgDaily = horizonDays > 0 ? total / horizonDays : 0;
  const overstockThreshold = total * p.overstockMultiplier;
  if (total > currentStock) {
    const stockout = new Date();
    stockout.setDate(stockout.getDate() + Math.max(1, Math.ceil(currentStock / Math.max(avgDaily, 1))));
    let msg = `⚠ Procure at least ${formatNumber(total - currentStock, 0)} kg before ${formatDate(stockout)} (${horizonDays}-day horizon)`;
    if (p.leadTimeDays != null && p.leadTimeDays > 0) {
      const orderBy = new Date();
      orderBy.setDate(orderBy.getDate() + Math.max(0, Math.ceil(p.leadTimeDays)));
      msg += ` · lead time ${p.leadTimeDays}d (order by ${formatDate(orderBy)})`;
    }
    box.textContent = msg;
  } else if (currentStock > overstockThreshold && total > 0) {
    box.textContent = `📦 Overstock risk: ${formatNumber(currentStock - overstockThreshold, 0)} kg excess vs forecast total (>${p.overstockMultiplier}×)`;
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
    const [data, chartData] = await Promise.all([
      api(`/api/forecast/${encodeURIComponent(materialCode)}?horizon=${horizon}`),
      api(`/api/charts/consumption-trend/${encodeURIComponent(materialCode)}`).catch(() => ({
        labels: [],
        datasets: [{ data: [] }],
      })),
    ]);
    updateForecastMethodBadge(data.forecast_method, data.material_category);
    const rows = data.forecast || [];
    const histLabels = chartData.labels || [];
    const histData = chartData.datasets?.[0]?.data || [];
    const chartPayload = buildMonthlyForecastChartData(histLabels, histData, rows);
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
    const granNote =
      data.forecast_granularity === "monthly" ? " (monthly)" : "";
    window.forecastChartInstance = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels: chartPayload.labels,
        datasets: [
          {
            label: `Actual consumption${granNote}`,
            data: chartPayload.actuals,
            borderColor: PALETTE[2],
            backgroundColor: "transparent",
            borderWidth: 2,
            tension: 0.25,
            spanGaps: false,
            pointRadius: 2,
            pointHoverRadius: 4,
            order: 1,
          },
          {
            label: `Forecast${granNote}`,
            data: chartPayload.forecast,
            borderColor: "#2E7CF6",
            backgroundColor: "transparent",
            borderWidth: 2.5,
            tension: 0.25,
            spanGaps: false,
            pointRadius: 3,
            pointHoverRadius: 5,
            order: 3,
          },
          {
            label: "Upper bound",
            data: chartPayload.upper,
            borderColor: "rgba(46,124,246,0.15)",
            backgroundColor: "rgba(46,124,246,0.12)",
            borderDash: [6, 4],
            borderWidth: 1.5,
            tension: 0.25,
            spanGaps: false,
            fill: "-1",
            pointRadius: 0,
            hidden: !bandVisible,
            order: 4,
          },
          {
            label: "Lower bound",
            data: chartPayload.lower,
            borderColor: "rgba(46,124,246,0.15)",
            backgroundColor: "transparent",
            borderDash: [6, 4],
            borderWidth: 1.5,
            tension: 0.25,
            spanGaps: false,
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
            ticks: { maxTicksLimit: 14 },
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: "kg / month" },
          },
        },
        plugins: {
          legend: { position: "bottom" },
          zoom: {
            zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: "x" },
            pan: { enabled: true, mode: "x" },
          },
          tooltip: {
            callbacks: {
              label(ctx) {
                const v = ctx.parsed.y;
                if (v == null || Number.isNaN(v)) return `${ctx.dataset.label}: —`;
                return `${ctx.dataset.label}: ${formatNumber(v, 2)} kg`;
              },
            },
          },
        },
      },
    });
    updateForecastStats(rows, horizon);
    updateProcurementBox(
      materialCode,
      rows,
      Number(data.current_stock_qty ?? data.currentStockQty ?? 0),
      horizon
    );
    const metaEl = document.getElementById("forecast-meta");
    if (metaEl && data.forecast_granularity === "monthly") {
      const name = materialNameByCode.get(materialCode) || "";
      metaEl.textContent = `${name ? `${name} · ` : ""}${materialCode} · ${horizon}d horizon · monthly forecast`;
    } else {
      setForecastMeta(materialCode, horizon);
    }
    clearChartState("forecast-chart-state");
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

function showParamStatus(msg, type = "success") {
  const el = document.getElementById("param-status");
  if (!el) return;
  if (!msg) {
    el.hidden = true;
    el.textContent = "";
    el.className = "param-status-banner";
    return;
  }
  el.hidden = false;
  el.textContent = msg;
  el.className = `param-status-banner ${type}`;
}

function paramNumInput(name, value, opts = {}) {
  const step = opts.step ?? "any";
  const min = opts.min != null ? ` min="${opts.min}"` : "";
  const max = opts.max != null ? ` max="${opts.max}"` : "";
  const placeholder = opts.placeholder ? ` placeholder="${escapeAttr(opts.placeholder)}"` : "";
  const val =
    value == null || value === ""
      ? ""
      : escapeAttr(String(value));
  return `<input type="number" class="param-input" data-field="${escapeAttr(name)}" value="${val}" step="${step}"${min}${max}${placeholder}>`;
}

function readParamsFromRow(tr) {
  const code = tr.dataset.code;
  const get = (field) => tr.querySelector(`[data-field="${field}"]`);
  const num = (field) => {
    const el = get(field);
    if (!el) return null;
    const v = el.value.trim();
    if (v === "") return field === "safety_stock" || field === "lead_time_days" || field === "max_stock" || field === "min_order_qty" ? null : 0;
    return Number(v);
  };
  const alertsEl = get("alerts_enabled");
  return {
    material_code: code,
    reorder_level: num("reorder_level"),
    safety_stock: num("safety_stock"),
    critical_pct: num("critical_pct"),
    urgent_days: Math.round(num("urgent_days")),
    warning_days: Math.round(num("warning_days")),
    overstock_multiplier: num("overstock_multiplier"),
    reorder_qty_factor: num("reorder_qty_factor"),
    lead_time_days:
      get("lead_time_days")?.value.trim() === "" ? null : Math.round(num("lead_time_days")),
    max_stock: get("max_stock")?.value.trim() === "" ? null : num("max_stock"),
    min_order_qty: get("min_order_qty")?.value.trim() === "" ? null : num("min_order_qty"),
    priority: Math.round(num("priority")),
    alerts_enabled: alertsEl ? alertsEl.checked : true,
    param_notes: get("param_notes")?.value.trim() ?? "",
  };
}

function mergeItemParams(item, payload) {
  const merged = { ...item, ...payload };
  merged.materialCode = item.materialCode ?? item.material_code ?? payload.material_code;
  merged.material_code = merged.materialCode;
  merged.reorderLevel = payload.reorder_level;
  merged.reorder_level = payload.reorder_level;
  merged.safetyStock = payload.safety_stock;
  merged.safety_stock = payload.safety_stock;
  merged.criticalPct = payload.critical_pct;
  merged.critical_pct = payload.critical_pct;
  merged.urgentDays = payload.urgent_days;
  merged.urgent_days = payload.urgent_days;
  merged.warningDays = payload.warning_days;
  merged.warning_days = payload.warning_days;
  merged.overstockMultiplier = payload.overstock_multiplier;
  merged.overstock_multiplier = payload.overstock_multiplier;
  merged.reorderQtyFactor = payload.reorder_qty_factor;
  merged.reorder_qty_factor = payload.reorder_qty_factor;
  merged.leadTimeDays = payload.lead_time_days;
  merged.lead_time_days = payload.lead_time_days;
  merged.maxStock = payload.max_stock;
  merged.max_stock = payload.max_stock;
  merged.minOrderQty = payload.min_order_qty;
  merged.min_order_qty = payload.min_order_qty;
  merged.priority = payload.priority;
  merged.alertsEnabled = payload.alerts_enabled;
  merged.alerts_enabled = payload.alerts_enabled;
  merged.paramNotes = payload.param_notes;
  merged.param_notes = payload.param_notes;
  return merged;
}

function syncInventoryFromParameters() {
  const byCode = new Map(
    (window.parametersData || []).map((it) => [it.materialCode ?? it.material_code, it])
  );
  window.inventoryData = (window.inventoryData || []).map((it) => {
    const code = it.materialCode ?? it.material_code;
    const updated = byCode.get(code);
    return updated ? { ...it, ...updated } : it;
  });
}

function getFilteredParametersRows() {
  const search = (document.getElementById("param-search")?.value || "").trim().toLowerCase();
  const category = document.getElementById("param-category-filter")?.value || "";
  const alerts = document.getElementById("param-alerts-filter")?.value || "";
  return (window.parametersData || []).filter((it) => {
    const code = it.materialCode ?? it.material_code ?? "";
    const name = it.itemName ?? it.item_name ?? "";
    const hay = `${code} ${name} ${it.category ?? ""}`.toLowerCase();
    if (search && !hay.includes(search)) return false;
    if (category && (it.category ?? "") !== category) return false;
    const p = resolveParams(it);
    if (alerts === "on" && !p.alertsEnabled) return false;
    if (alerts === "off" && p.alertsEnabled) return false;
    return true;
  });
}

function sortParametersRows(rows) {
  const { key, dir } = parametersSort;
  const mult = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let av = a[key] ?? a[key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)] ?? "";
    let bv = b[key] ?? b[key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)] ?? "";
    if (key === "alertsEnabled") {
      av = resolveParams(a).alertsEnabled ? 1 : 0;
      bv = resolveParams(b).alertsEnabled ? 1 : 0;
    }
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * mult;
    return String(av).localeCompare(String(bv)) * mult;
  });
}

function renderParametersPagination(pages) {
  const el = document.getElementById("param-pagination");
  if (!el) return;
  el.innerHTML = "";
  if (pages <= 1) return;
  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "btn-secondary";
  prev.textContent = "← Prev";
  prev.disabled = parametersPage <= 1;
  prev.addEventListener("click", () => {
    parametersPage--;
    renderParametersTableBody();
  });
  const next = document.createElement("button");
  next.type = "button";
  next.className = "btn-secondary";
  next.textContent = "Next →";
  next.disabled = parametersPage >= pages;
  next.addEventListener("click", () => {
    parametersPage++;
    renderParametersTableBody();
  });
  const label = document.createElement("span");
  label.textContent = `Page ${parametersPage} of ${pages}`;
  el.append(prev, label, next);
}

function renderParametersTableBody() {
  const tbody = document.getElementById("param-tbody");
  const filtered = sortParametersRows(getFilteredParametersRows());
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (parametersPage > pages) parametersPage = pages;
  const start = (parametersPage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(start, start + PAGE_SIZE);
  const counter = document.getElementById("param-record-count");
  if (counter) {
    counter.textContent =
      total === 0
        ? "Showing 0 materials"
        : `Showing ${start + 1}–${start + pageRows.length} of ${total}`;
  }
  if (!tbody) return;
  if (!pageRows.length) {
    tbody.innerHTML =
      '<tr><td colspan="17" class="loading-row">No materials match your filters.</td></tr>';
    return;
  }
  tbody.innerHTML = pageRows
    .map((it) => {
      const code = it.materialCode ?? it.material_code ?? "";
      const name = it.itemName ?? it.item_name ?? "";
      const cat = it.category ?? "";
      const p = resolveParams(it);
      const safetyVal =
        it.safetyStock ?? it.safety_stock;
      const safetyDisplay =
        safetyVal != null && safetyVal !== "" ? Number(safetyVal) : "";
      const leadVal = it.leadTimeDays ?? it.lead_time_days;
      const maxVal = it.maxStock ?? it.max_stock;
      const minVal = it.minOrderQty ?? it.min_order_qty;
      const dirty = parametersDirty.has(code);
      return `<tr data-code="${escapeHtml(code)}" class="${dirty ? "row-dirty" : ""}">
        ${tipSourceCell(code, "param-sticky param-sticky--code")}
        ${tipSourceCell(name, "param-sticky param-sticky--name")}
        ${tipSourceCell(cat, "param-category-cell")}
        <td class="num">${paramNumInput("reorder_level", p.reorder, { min: 0 })}</td>
        <td class="num">${paramNumInput("safety_stock", safetyDisplay, { min: 0, placeholder: "—" })}</td>
        <td class="num">${paramNumInput("critical_pct", p.criticalPct, { min: 0, max: 1, step: "0.01" })}</td>
        <td class="num">${paramNumInput("urgent_days", p.urgentDays, { min: 1, step: 1 })}</td>
        <td class="num">${paramNumInput("warning_days", p.warningDays, { min: 2, step: 1 })}</td>
        <td class="num">${paramNumInput("overstock_multiplier", p.overstockMultiplier, { min: 0.1, step: "0.1" })}</td>
        <td class="num">${paramNumInput("reorder_qty_factor", p.reorderQtyFactor, { min: 0.1, step: "0.1" })}</td>
        <td class="num">${paramNumInput("lead_time_days", leadVal ?? "", { min: 0, step: 1, placeholder: "—" })}</td>
        <td class="num">${paramNumInput("max_stock", maxVal ?? "", { min: 0, placeholder: "—" })}</td>
        <td class="num">${paramNumInput("min_order_qty", minVal ?? "", { min: 0, placeholder: "—" })}</td>
        <td class="num">${paramNumInput("priority", p.priority, { step: 1 })}</td>
        <td><input type="checkbox" class="param-input" data-field="alerts_enabled" ${p.alertsEnabled ? "checked" : ""} aria-label="Alerts enabled"></td>
        <td><input type="text" class="param-input param-notes-input" data-field="param_notes" value="${escapeAttr(p.paramNotes || "")}"></td>
        <td class="no-print"><button type="button" class="btn-secondary btn-param-save-row" data-code="${escapeHtml(code)}">Save</button></td>
      </tr>`;
    })
    .join("");

  tbody.querySelectorAll(".param-input").forEach((input) => {
    input.addEventListener("change", () => {
      const tr = input.closest("tr");
      if (!tr) return;
      parametersDirty.add(tr.dataset.code);
      tr.classList.add("row-dirty");
      const saveAll = document.getElementById("btn-save-parameters");
      if (saveAll) saveAll.disabled = parametersDirty.size === 0;
    });
  });
  tbody.querySelectorAll(".btn-param-save-row").forEach((btn) => {
    btn.addEventListener("click", () => void saveParameterRow(btn.dataset.code));
  });
  requestAnimationFrame(() => applyOverflowTooltips(tbody));
  renderParametersPagination(pages);
}

async function loadParametersPage() {
  const sid = "page-parameters";
  clearError(sid);
  showLoading(sid);
  showParamStatus("");
  parametersDirty.clear();
  const saveAll = document.getElementById("btn-save-parameters");
  if (saveAll) saveAll.disabled = true;
  const tbody = document.getElementById("param-tbody");
  try {
    const data = await api("/api/parameters/list");
    const items = data.items ?? [];
    window.parametersData = items;
    loadExcelBaseline().catch(() => {});
    for (const it of items) {
      const code = it.materialCode ?? it.material_code;
      const rate = it.avgDailyConsumption ?? it.avg_daily_consumption;
      if (code && rate != null) consumptionRateByCode.set(code, Number(rate));
    }
    const catSel = document.getElementById("param-category-filter");
    if (catSel && !catSel.dataset.filled) {
      catSel.dataset.filled = "1";
      const cats = [...new Set(items.map((it) => it.category).filter(Boolean))].sort();
      for (const c of cats) {
        const opt = document.createElement("option");
        opt.value = c;
        opt.textContent = c;
        catSel.appendChild(opt);
      }
    }
    parametersPage = 1;
    renderParametersTableBody();
  } catch (e) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="17" class="loading-row">${escapeHtml(e.message || "Could not load parameters.")}</td></tr>`;
    }
    showError(sid, e.message || "Failed to load parameters");
  } finally {
    hideLoading(sid);
  }
}

async function saveParameterRow(code) {
  const tr = document.querySelector(`#param-tbody tr[data-code="${CSS.escape(code)}"]`);
  if (!tr) return;
  const payload = readParamsFromRow(tr);
  try {
    await apiPut(`/api/parameters/${encodeURIComponent(code)}`, payload);
    const idx = window.parametersData.findIndex(
      (it) => (it.materialCode ?? it.material_code) === code
    );
    if (idx >= 0) window.parametersData[idx] = mergeItemParams(window.parametersData[idx], payload);
    parametersDirty.delete(code);
    tr.classList.remove("row-dirty");
    showParamStatus(`Saved parameters for ${code}.`, "success");
    syncInventoryFromParameters();
    invalidateDataPages();
    loaded.parameters = true;
    const saveAll = document.getElementById("btn-save-parameters");
    if (saveAll) saveAll.disabled = parametersDirty.size === 0;
  } catch (e) {
    showParamStatus(e.message || "Save failed", "error");
  }
}

function avgDailyRateForItem(item) {
  const code = item.materialCode ?? item.material_code ?? "";
  const fromMap = consumptionRateByCode.get(code);
  if (fromMap != null && Number.isFinite(fromMap)) return Number(fromMap);
  const onItem = item.avgDailyConsumption ?? item.avg_daily_consumption;
  if (onItem != null && onItem !== "" && Number.isFinite(Number(onItem))) return Number(onItem);
  return 0;
}

function computePresetReorderLevel(item, presetKey, preset) {
  const existing = Number(item.reorderLevel ?? item.reorder_level ?? 0);
  const rate = avgDailyRateForItem(item);
  if (presetKey === "new" && preset.reorder_lead_mult && rate > 0) {
    const lead = preset.lead_time_days ?? 14;
    const mult = preset.reorder_qty_factor ?? 2;
    return Math.ceil(rate * lead * mult);
  }
  return existing;
}

function buildPresetFields(item, presetKey) {
  const preset = PARAM_PRESETS[presetKey];
  const code = item.materialCode ?? item.material_code ?? "";
  const existingReorder = Number(item.reorderLevel ?? item.reorder_level ?? 0);

  let reorder_level = existingReorder;
  if (preset.from_excel && excelBaselineByCode && excelBaselineByCode[code]) {
    reorder_level = Number(excelBaselineByCode[code].reorder_level ?? existingReorder);
  } else if (presetKey === "new") {
    reorder_level = computePresetReorderLevel(item, presetKey, preset);
  }

  let safety_stock = null;
  let max_stock = null;
  let min_order_qty = null;

  if (presetKey === "new") {
    if (preset.safety_ratio != null && reorder_level > 0) {
      safety_stock = Math.ceil(reorder_level * preset.safety_ratio);
    }
    if (preset.max_stock_from_reorder && reorder_level > 0) {
      max_stock = Math.ceil(reorder_level * preset.overstock_multiplier);
    }
    min_order_qty =
      preset.min_order_qty != null
        ? preset.min_order_qty
        : reorder_level > 0
          ? 1
          : null;
  }

  return {
    material_code: code,
    reorder_level,
    safety_stock,
    critical_pct: preset.critical_pct,
    urgent_days: preset.urgent_days,
    warning_days: preset.warning_days,
    overstock_multiplier: preset.overstock_multiplier,
    reorder_qty_factor: preset.reorder_qty_factor,
    lead_time_days: preset.lead_time_days ?? null,
    max_stock,
    min_order_qty,
    alerts_enabled: preset.alerts_enabled,
    priority: preset.priority,
    param_notes: preset.param_notes ?? "",
  };
}

async function applyParameterPreset(presetKey) {
  const preset = PARAM_PRESETS[presetKey];
  if (!preset) return;
  const items = window.parametersData || [];
  if (!items.length) {
    showParamStatus("No materials loaded.", "error");
    return;
  }
  if (preset.from_excel) {
    try {
      await loadExcelBaseline();
    } catch (e) {
      showParamStatus(e.message || "Could not load Excel baseline", "error");
      return;
    }
  }
  const msg =
    `Apply "${preset.label}" to all ${items.length} materials?\n\n` +
    `${preset.summary}\n\n` +
    `This overwrites every parameter column for all materials.`;
  if (!confirm(msg)) return;

  const updates = items.map((it) => buildPresetFields(it, presetKey));
  const missingExcel = preset.from_excel
    ? updates.filter((u) => !excelBaselineByCode?.[u.material_code]).length
    : 0;
  showParamStatus(`Applying ${preset.label}…`, "success");
  try {
    const result = await apiPost("/api/parameters/bulk", { updates });
    for (const payload of updates) {
      const code = payload.material_code;
      const idx = window.parametersData.findIndex(
        (it) => (it.materialCode ?? it.material_code) === code
      );
      if (idx >= 0) window.parametersData[idx] = mergeItemParams(window.parametersData[idx], payload);
    }
    parametersDirty.clear();
    syncInventoryFromParameters();
    invalidateDataPages();
    loaded.parameters = true;
    renderParametersTableBody();
    const saveAll = document.getElementById("btn-save-parameters");
    if (saveAll) saveAll.disabled = true;
    const errors = result.errors ?? [];
    if (errors.length) {
      showParamStatus(
        `${preset.label}: saved ${result.updated ?? 0}, ${errors.length} error(s).`,
        "error"
      );
    } else {
      let okMsg = `${preset.label} applied to ${result.updated ?? updates.length} material(s).`;
      if (missingExcel > 0) {
        okMsg += ` (${missingExcel} material(s) kept current reorder — not in Excel import.)`;
      }
      showParamStatus(okMsg, "success");
    }
  } catch (e) {
    showParamStatus(e.message || `Could not apply ${preset.label}`, "error");
  }
}

async function saveAllParameters() {
  if (!parametersDirty.size) return;
  const updates = [];
  for (const code of parametersDirty) {
    const tr = document.querySelector(`#param-tbody tr[data-code="${CSS.escape(code)}"]`);
    if (tr) updates.push(readParamsFromRow(tr));
  }
  const saveBtn = document.getElementById("btn-save-parameters");
  if (saveBtn) saveBtn.disabled = true;
  try {
    const result = await apiPost("/api/parameters/bulk", { updates });
    const errors = result.errors ?? [];
    for (const payload of updates) {
      const code = payload.material_code;
      const idx = window.parametersData.findIndex(
        (it) => (it.materialCode ?? it.material_code) === code
      );
      if (idx >= 0) window.parametersData[idx] = mergeItemParams(window.parametersData[idx], payload);
      parametersDirty.delete(code);
    }
    syncInventoryFromParameters();
    invalidateDataPages();
    loaded.parameters = true;
    renderParametersTableBody();
    if (errors.length) {
      showParamStatus(`Saved ${result.updated ?? 0} row(s). ${errors.length} error(s).`, "error");
    } else {
      showParamStatus(`Saved ${result.updated ?? updates.length} material(s).`, "success");
    }
  } catch (e) {
    showParamStatus(e.message || "Bulk save failed", "error");
    if (saveBtn) saveBtn.disabled = parametersDirty.size === 0;
  }
}

function bindParametersControls() {
  ["param-search", "param-category-filter", "param-alerts-filter"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el || el.dataset.bound) return;
    el.dataset.bound = "1";
    el.addEventListener(id === "param-search" ? "input" : "change", () => {
      parametersPage = 1;
      renderParametersTableBody();
    });
  });
  document.querySelectorAll("#parameters-table th[data-sort]").forEach((th) => {
    if (th.dataset.bound) return;
    th.dataset.bound = "1";
    th.style.cursor = "pointer";
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (parametersSort.key === key) {
        parametersSort.dir = parametersSort.dir === "asc" ? "desc" : "asc";
      } else {
        parametersSort = { key, dir: "asc" };
      }
      renderParametersTableBody();
    });
  });
  const presetOriginal = document.getElementById("btn-preset-original");
  if (presetOriginal && !presetOriginal.dataset.bound) {
    presetOriginal.dataset.bound = "1";
    presetOriginal.addEventListener("click", () => void applyParameterPreset("original"));
  }
  const presetNew = document.getElementById("btn-preset-new");
  if (presetNew && !presetNew.dataset.bound) {
    presetNew.dataset.bound = "1";
    presetNew.addEventListener("click", () => void applyParameterPreset("new"));
  }
  const saveAll = document.getElementById("btn-save-parameters");
  if (saveAll && !saveAll.dataset.bound) {
    saveAll.dataset.bound = "1";
    saveAll.addEventListener("click", () => void saveAllParameters());
  }
  const exportBtn = document.getElementById("btn-export-parameters");
  if (exportBtn && !exportBtn.dataset.bound) {
    exportBtn.dataset.bound = "1";
    exportBtn.addEventListener("click", () => {
      exportCsv(
        "spareai-parameters.csv",
        (window.parametersData || []).map((it) => {
          const p = resolveParams(it);
          return {
            materialCode: it.materialCode ?? it.material_code,
            itemName: it.itemName ?? it.item_name,
            category: it.category,
            reorderLevel: p.reorder,
            safetyStock: it.safetyStock ?? it.safety_stock ?? "",
            criticalPct: p.criticalPct,
            urgentDays: p.urgentDays,
            warningDays: p.warningDays,
            overstockMultiplier: p.overstockMultiplier,
            reorderQtyFactor: p.reorderQtyFactor,
            leadTimeDays: p.leadTimeDays ?? "",
            maxStock: p.maxStock ?? "",
            minOrderQty: p.minOrderQty ?? "",
            priority: p.priority,
            alertsEnabled: p.alertsEnabled,
            paramNotes: p.paramNotes,
          };
        }),
        [
          "materialCode",
          "itemName",
          "category",
          "reorderLevel",
          "safetyStock",
          "criticalPct",
          "urgentDays",
          "warningDays",
          "overstockMultiplier",
          "reorderQtyFactor",
          "leadTimeDays",
          "maxStock",
          "minOrderQty",
          "priority",
          "alertsEnabled",
          "paramNotes",
        ]
      );
    });
  }
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
  bindParametersControls();
  bindChartControls();
  bindForecastControls();
  bindOverviewDrilldown();
  initTableOverflowTooltips();
  initAllSearchableSelects();
  document.getElementById("btn-download-report")?.addEventListener("click", downloadOverviewReport);
  document.getElementById("btn-print-overview")?.addEventListener("click", () => window.print());
  const hash = location.hash.slice(1);
  const startPage = VALID_PAGES.includes(hash) ? hash : "overview";
  navigateTo(startPage);
});
