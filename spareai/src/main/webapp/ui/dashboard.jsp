<%@ page contentType="text/html; charset=UTF-8" %>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SpareAI — Inventory Dashboard</title>

  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet">

  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/hammerjs@2.0.8/hammer.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-zoom@2.0.1/dist/chartjs-plugin-zoom.min.js"></script>

  <link rel="stylesheet" href="${pageContext.request.contextPath}/assets/spareai.css">
</head>
<body>
<script>
  try {
    if (localStorage.getItem("spareai-theme") === "dark") {
      document.body.classList.add("dark-mode");
    }
  } catch (e) {}
</script>

  <nav class="navbar no-print">
    <div class="navbar-brand">⚙ SpareAI</div>
    <div class="navbar-actions">
      <button type="button" class="btn-icon no-print" id="theme-toggle" aria-label="Toggle theme">🌙</button>
      <button type="button" class="sidebar-toggle no-print" id="sidebar-toggle" aria-label="Open menu">☰</button>
    </div>
  </nav>

  <aside class="sidebar no-print" id="sidebar">
    <ul>
      <li><a href="#overview" class="nav-item" data-page="overview">🏠 Overview</a></li>
      <li><a href="#charts" class="nav-item" data-page="charts">📈 Charts</a></li>
      <li><a href="#inventory" class="nav-item" data-page="inventory">🗄 Inventory</a></li>
      <li><a href="#critical" class="nav-item" data-page="critical">⚠ Critical Stock</a></li>
      <li><a href="#forecast" class="nav-item" data-page="forecast">🔮 Forecast</a></li>
    </ul>
  </aside>

  <main class="main-content">

    <section id="page-overview" class="page-section section-card">
      <div class="section-header-row">
        <h2 class="section-title">Overview</h2>
        <div class="header-actions no-print">
          <button type="button" class="btn-secondary" id="btn-download-report">⬇ Download Report</button>
          <button type="button" class="btn-secondary" id="btn-print-overview">🖨 Print</button>
        </div>
      </div>

      <div id="overview-alerts" class="alerts-banner" hidden></div>

      <div class="kpi-grid kpi-grid--six">
        <div class="kpi-tile" id="kpi-total-materials"><span class="kpi-label">Total Materials</span><span class="kpi-value">—</span></div>
        <div class="kpi-tile" id="kpi-total-departments"><span class="kpi-label">Total Departments</span><span class="kpi-value">—</span></div>
        <div class="kpi-tile" id="kpi-total-value"><span class="kpi-label">Total Stock Value (₹)</span><span class="kpi-value">—</span></div>
        <div class="kpi-tile" id="kpi-critical"><span class="kpi-label">Critical Items</span><span class="kpi-value">—</span></div>
        <div class="kpi-tile" id="kpi-forecast-shortages"><span class="kpi-label">Forecasted Shortages</span><span class="kpi-value">—</span></div>
        <div class="kpi-tile" id="kpi-zero-stock"><span class="kpi-label">Items at Zero Stock</span><span class="kpi-value">—</span></div>
      </div>

      <div class="quick-kpi-row" id="quick-kpis">
        <div class="quick-kpi"><span class="quick-kpi-label">Fastest moving</span><span class="quick-kpi-value" id="qk-fastest">—</span></div>
        <div class="quick-kpi"><span class="quick-kpi-label">Slowest moving</span><span class="quick-kpi-value" id="qk-slowest">—</span></div>
        <div class="quick-kpi"><span class="quick-kpi-label">Reorder alerts</span><span class="quick-kpi-value" id="qk-reorder">—</span></div>
        <div class="quick-kpi quick-kpi--spark">
          <span class="quick-kpi-label">Monthly consumption</span>
          <span class="quick-kpi-value" id="kpi-monthly">—</span>
          <div id="monthly-sparkline-container" class="monthly-sparkline-container chart-container">
            <canvas id="spark-monthly"></canvas>
          </div>
        </div>
      </div>

      <div class="insights-grid">
        <div class="insight-panel">
          <h3>Top 5 most consumed</h3>
          <table class="mini-table" id="insight-top-consumed"><tbody><tr><td class="loading-row">Loading…</td></tr></tbody></table>
        </div>
        <div class="insight-panel">
          <h3>Top 5 closest to stockout</h3>
          <table class="mini-table" id="insight-stockout"><tbody><tr><td class="loading-row">Loading…</td></tr></tbody></table>
        </div>
      </div>

      <div class="system-status-strip" id="system-status">
        <span id="status-refreshed">Last refreshed: —</span>
        <span id="status-records">Total records loaded: —</span>
        <span id="status-prophet" class="status-pill"><span class="status-dot" id="prophet-dot"></span><span id="prophet-label">Prophet checking…</span></span>
      </div>
    </section>

    <section id="page-charts" class="page-section section-card">
      <h2 class="section-title">Charts</h2>

      <div class="charts-global-controls charts-controls-bar sticky-controls no-print">
        <label>Department <select id="global-dept-filter"><option value="">All</option></select></label>
        <label>Category <select id="global-category-filter"><option value="">All</option></select></label>
        <div class="granularity-toggle" id="granularity-toggle">
          <button type="button" class="gran-btn active" data-gran="daily">Daily</button>
          <button type="button" class="gran-btn" data-gran="weekly">Weekly</button>
          <button type="button" class="gran-btn" data-gran="monthly">Monthly</button>
        </div>
      </div>

      <div class="chart-section" id="chart-section-stock">
        <div class="chart-section-header">
          <h3>Stock Levels</h3>
          <button type="button" class="btn-export no-print" data-export="stock">⬇ PNG</button>
        </div>
        <div class="chart-controls no-print">
          <label>Category <select id="stock-category-filter"><option value="">All</option></select></label>
          <label>Top N</label>
          <div class="stock-topn-btns no-print">
            <button type="button" class="stock-topn-btn" data-topn="10">Top 10</button>
            <button type="button" class="stock-topn-btn active" data-topn="20">Top 20</button>
            <button type="button" class="stock-topn-btn" data-topn="50">Top 50</button>
            <button type="button" class="stock-topn-btn" data-topn="all">All</button>
          </div>
          <select id="stock-topn" hidden>
            <option value="10">10</option>
            <option value="20" selected>20</option>
            <option value="50">50</option>
            <option value="all">All</option>
          </select>
        </div>
        <div class="chart-canvas-wrap"><canvas id="chart-stock-levels"></canvas></div>
        <div class="chart-state" id="stock-chart-state"></div>
      </div>

      <div class="charts-grid charts-grid--split">
        <div class="chart-section" id="chart-section-category">
          <div class="chart-section-header">
            <h3>Category Distribution</h3>
            <button type="button" class="btn-export no-print" data-export="category">⬇ PNG</button>
          </div>
          <div class="chart-controls no-print">
            <button type="button" class="toggle-btn active" id="cat-mode-count">By Count</button>
            <button type="button" class="toggle-btn" id="cat-mode-value">By Value</button>
          </div>
          <div class="chart-canvas-wrap"><canvas id="chart-category"></canvas></div>
          <div class="chart-state" id="category-chart-state"></div>
        </div>

        <div class="chart-section" id="dept-chart-section">
          <div class="chart-section-header">
            <h3>Department Consumption</h3>
            <button type="button" class="btn-export no-print" data-export="dept">⬇ PNG</button>
          </div>
          <div class="chart-canvas-wrap"><canvas id="chart-dept"></canvas></div>
          <div class="chart-state" id="dept-chart-state"></div>
        </div>
      </div>

      <div class="chart-section" id="chart-section-trend">
        <div class="chart-section-header">
          <h3>Consumption Trend</h3>
          <button type="button" class="btn-export no-print" data-export="trend">⬇ PNG</button>
        </div>
        <div class="chart-controls no-print">
          <label>Material:</label>
          <select id="trend-material-select"><option value="">— select —</option></select>
          <label>Range:</label>
          <button type="button" class="range-btn active" data-range="7">7d</button>
          <button type="button" class="range-btn" data-range="30">30d</button>
          <button type="button" class="range-btn" data-range="90">90d</button>
          <button type="button" class="range-btn" data-range="custom">Custom</button>
          <span id="custom-range-inputs" hidden>
            <input type="date" id="range-from"> to
            <input type="date" id="range-to">
            <button type="button" id="apply-range" class="btn-secondary">Apply</button>
          </span>
        </div>
        <div class="chart-canvas-wrap"><canvas id="chart-trend"></canvas></div>
        <div class="chart-state" id="trend-chart-state"></div>
      </div>

      <div class="chart-section" id="chart-section-cumulative">
        <div class="chart-section-header">
          <h3>Cumulative Consumption</h3>
          <button type="button" class="btn-export no-print" data-export="cumulative">⬇ PNG</button>
        </div>
        <div class="chart-canvas-wrap"><canvas id="chart-cumulative"></canvas></div>
        <div class="chart-state" id="cumulative-chart-state"></div>
      </div>

      <div class="chart-section" id="chart-section-compare">
        <div class="chart-section-header">
          <h3>Compare Materials</h3>
          <button type="button" class="btn-export no-print" data-export="compare">⬇ PNG</button>
        </div>
        <div class="chart-controls no-print">
          <label>A <select id="compare-a"><option value="">—</option></select></label>
          <label>B <select id="compare-b"><option value="">—</option></select></label>
          <label>C <select id="compare-c"><option value="">—</option></select></label>
          <button type="button" class="btn-secondary" id="btn-compare">Compare</button>
        </div>
        <div class="chart-canvas-wrap"><canvas id="chart-compare"></canvas></div>
        <div class="chart-state" id="compare-chart-state"></div>
      </div>
    </section>

    <section id="page-inventory" class="page-section section-card">
      <div class="section-header-row">
        <h2 class="section-title">Inventory Summary Report</h2>
        <div class="header-actions no-print">
          <button type="button" class="btn-secondary" id="btn-export-inventory">Export CSV</button>
        </div>
      </div>

      <p id="inv-record-count" class="record-counter">Showing 0 materials</p>
      <div id="inv-warning" class="warning-banner" hidden></div>

      <details class="validation-panel no-print" id="inv-validation" hidden>
        <summary>Data validation</summary>
        <div id="inv-validation-chips" class="chip-row"></div>
      </details>

      <div class="filters-row no-print">
        <input type="search" id="inv-search" placeholder="Search code, description, department…" class="search-input" autocomplete="off">
        <select id="inv-dept-filter"><option value="">All departments</option></select>
        <select id="inv-category-filter"><option value="">All categories</option></select>
        <select id="inv-status-filter">
          <option value="">Status: All</option>
          <option value="OK">OK</option>
          <option value="LOW">Low</option>
          <option value="CRITICAL">Critical</option>
        </select>
      </div>

      <div class="table-wrapper">
        <table class="data-table" id="inventory-table">
          <thead>
            <tr>
              <th data-sort="materialCode">Material Code</th>
              <th data-sort="itemName">Description</th>
              <th data-sort="department">Department</th>
              <th data-sort="category">Category</th>
              <th class="num" data-sort="stockQty">Available Stock</th>
              <th data-sort="unit">Unit</th>
              <th class="num" data-sort="reorderLevel">Reorder Level</th>
              <th class="num" data-sort="unitCost">Unit Cost (₹)</th>
              <th class="num" data-sort="stockValue">Stock Value (₹)</th>
              <th class="num" data-sort="consumptionRate">Consumption Rate</th>
              <th data-sort="lastUpdated">Last Updated</th>
              <th data-sort="status">Status</th>
              <th class="no-print">Actions</th>
            </tr>
          </thead>
          <tbody id="inv-tbody">
            <tr><td colspan="13" class="loading-row">Loading…</td></tr>
          </tbody>
        </table>
      </div>

      <div class="pagination no-print" id="inv-pagination"></div>
    </section>

    <section id="page-critical" class="page-section section-card">
      <div class="section-header-row">
        <h2 class="section-title">⚠ Critical &amp; Low Stock Items</h2>
        <div class="header-actions no-print">
          <button type="button" class="btn-secondary" id="btn-export-critical">Export CSV</button>
          <button type="button" class="btn-secondary" id="btn-print-critical">Print</button>
        </div>
      </div>

      <div class="filter-tabs no-print" id="critical-tabs">
        <button type="button" class="tab-btn active" data-tab="all">All <span class="tab-count" id="tab-count-all">0</span></button>
        <button type="button" class="tab-btn" data-tab="urgent">Urgent <span class="tab-count" id="tab-count-urgent">0</span></button>
        <button type="button" class="tab-btn" data-tab="warning">Warning <span class="tab-count" id="tab-count-warning">0</span></button>
        <button type="button" class="tab-btn" data-tab="watch">Watch <span class="tab-count" id="tab-count-watch">0</span></button>
      </div>

      <p id="critical-record-count" class="record-counter">Showing 0 critical items</p>

      <div class="table-wrapper">
        <table class="data-table critical-table" id="critical-table">
          <thead>
            <tr>
              <th>Material Code</th>
              <th>Name</th>
              <th>Category</th>
              <th class="num">Current Stock</th>
              <th class="num">Safety Stock Level</th>
              <th class="num">Days to Zero</th>
              <th>Stockout Date</th>
              <th class="num">Suggested Reorder Qty</th>
              <th>Severity</th>
            </tr>
          </thead>
          <tbody id="critical-tbody">
            <tr><td colspan="9" class="loading-row">Loading…</td></tr>
          </tbody>
        </table>
      </div>

      <div class="priority-cards" id="priority-cards">
        <div class="priority-card" id="priority-urgent"><h4>Most urgent</h4><p>—</p></div>
        <div class="priority-card" id="priority-cost"><h4>Highest cost critical</h4><p>—</p></div>
        <div class="priority-card" id="priority-gap"><h4>Largest reorder gap</h4><p>—</p></div>
      </div>
    </section>

    <section id="page-forecast" class="page-section section-card">
      <div class="section-header-row">
        <div>
          <h2 class="section-title">🔮 Demand Forecast</h2>
          <p id="forecast-meta" class="forecast-meta"></p>
        </div>
        <div class="forecast-controls no-print">
          <label for="forecast-material-select">Material:</label>
          <select id="forecast-material-select"><option value="">— select —</option></select>
          <div class="horizon-btns">
            <button type="button" class="horizon-btn active" data-horizon="30">30d</button>
            <button type="button" class="horizon-btn" data-horizon="60">60d</button>
            <button type="button" class="horizon-btn" data-horizon="90">90d</button>
          </div>
          <button type="button" class="toggle-btn" id="band-toggle" aria-pressed="true">☁ Band ON</button>
          <button type="button" class="btn-secondary" id="btn-reset-zoom">Reset Zoom</button>
        </div>
      </div>

      <div class="kpi-grid kpi-grid--four" id="forecast-stats">
        <div class="kpi-tile"><span class="kpi-label">Average Daily Demand</span><span class="kpi-value" id="fs-avg">—</span></div>
        <div class="kpi-tile"><span class="kpi-label">Peak Demand</span><span class="kpi-value" id="fs-peak">—</span></div>
        <div class="kpi-tile"><span class="kpi-label">Lowest Demand</span><span class="kpi-value" id="fs-low">—</span></div>
        <div class="kpi-tile"><span class="kpi-label">Total Forecasted</span><span class="kpi-value" id="fs-total">—</span></div>
      </div>

      <div class="chart-section chart-section--forecast">
        <div class="chart-canvas-wrap chart-box--forecast">
          <canvas id="chart-forecast"></canvas>
          <p id="forecast-placeholder" class="placeholder-msg">Select a material above to view its forecast.</p>
        </div>
        <div class="chart-state" id="forecast-chart-state"></div>
      </div>

      <div class="chart-section" id="chart-section-historical">
        <h3>Historical Consumption</h3>
        <div class="chart-canvas-wrap"><canvas id="chart-historical"></canvas></div>
        <div class="chart-state" id="historical-chart-state"></div>
      </div>

      <div class="procurement-box" id="procurement-box">Select a material to see procurement guidance.</div>
    </section>

  </main>

  <script>
    window.CONTEXT_PATH = '${pageContext.request.contextPath}';
  </script>
  <script src="${pageContext.request.contextPath}/assets/spareai-dashboard.js"></script>

</body>
</html>
