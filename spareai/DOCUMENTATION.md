# SpareAI — Complete Project Documentation

SpareAI is a spare-parts inventory and demand analytics web application. It connects to a **MySQL** database for live stock and consumption data, exposes **JSON REST APIs** from a **Java WAR** deployed on **Apache Tomcat 10**, and uses a small **Flask + Prophet** service for statistical forecasts. The browser UI is a single **JSP** dashboard with **vanilla JavaScript** and **Chart.js** charts. It is aimed at **plant managers**, **warehouse teams**, and **procurement** staff who need visibility into stock levels, critical items, and forward-looking consumption.

---

## 1. How the Entire Program Works

This section describes the system from the database to the browser so a new developer can understand the whole flow in one read.

### 1.1 System Architecture Overview

> **Implementation note:** This repository uses **Jakarta Servlet 6** and **plain JDBC** (via **HikariCP**), packaged as a **WAR** for **Tomcat 10**. It does **not** use Spring Boot or JPA. The diagram below reflects the actual stack.

ASCII overview:

```
[MySQL Database]
       ↑  JDBC (HikariCP) — SQL in DAO classes
       |
[Java WAR — Tomcat 10]
  com.spareai.servlets.*  +  com.spareai.dao.*
       |  JSON over HTTP  (/api/...)
       ├──────────────────────────────┐
       |                              |
[Flask + Prophet]              [JSP + spareai-dashboard.js]
spareai/flask-service/app.py   spareai/src/main/webapp/ui/dashboard.jsp
  POST /forecast                    Chart.js (CDN) + fetch() to /api/...
```

| Component | Technology | Location in repo |
|-----------|------------|------------------|
| Database | MySQL 8 (schema in SQL) | `spareai/db/schema.sql` |
| Connection pool & JDBC URL | HikariCP, env-driven | `spareai/src/main/java/com/spareai/util/DBConnection.java` |
| REST APIs | Jakarta `HttpServlet` subclasses | `spareai/src/main/java/com/spareai/servlets/` |
| URL mapping | `web.xml` | `spareai/src/main/webapp/WEB-INF/web.xml` |
| Flask microservice | Flask + Prophet + pandas | `spareai/flask-service/app.py` |
| HTTP client to Flask | `java.net.http.HttpClient` | `spareai/src/main/java/com/spareai/util/FlaskClient.java` |
| Dashboard UI | JSP + CSS + JS | `spareai/src/main/webapp/ui/dashboard.jsp`, `.../assets/spareai-dashboard.js`, `.../assets/spareai.css` |

### 1.2 Component Breakdown

#### Database Layer

- **Engine:** MySQL (connector in `pom.xml`: `mysql-connector-j`; JDBC URL defaults to MySQL).
- **Schema file:** `spareai/db/schema.sql` defines tables used by the Java code.

**Tables (from schema + DAO usage):**

| Table | Purpose |
|-------|---------|
| `inventory_items` | Master list of materials: codes, names, categories, stock, reorder levels, unit cost, location. |
| `consumption_log` | Individual consumption/issue rows: material, quantity, date, optional department and remarks. |
| `forecast_cache` | Cached Prophet (or fallback) forecast JSON per material and horizon (`forecast_horizon`), with `expires_at`. |
| `audit_log` | Audit trail for consumption insert/update/delete (`entity_type`, JSON old/new values, `source_ip`). |

#### Spring Boot Backend

> **Clarification:** The backend is **not** Spring Boot. It is a **Jakarta Servlet** application. The responsibilities below are implemented by **`InventoryServlet`**, **`ConsumptionServlet`**, **`ForecastServlet`**, and **`ChartServlet`**, all extending **`BaseServlet`**, with JSON envelopes from **`JsonUtil`**.

- **Role:** Serves JSON under `/api/...`, reads/writes MySQL through DAO classes, and calls Flask for forecasts when appropriate.

**API endpoints** (relative to the WAR context path, e.g. `/spareai`). Method and path are after the servlet prefix.

**Inventory** — servlet prefix: `/api/inventory` — class `InventoryServlet`

| Method | Endpoint (pathInfo) | Returns |
|--------|---------------------|---------|
| GET | `/list` or `/` | JSON `data`: `{ "items": [...], "total": <int> }` — all `InventoryItem` rows. |
| GET | `/low-stock` | JSON `data`: `{ "critical": [...] }` — items where `stock_qty <= reorder_level`. |
| GET | `/summary` | JSON `data`: KPI map — `total_skus`, `low_stock_count`, `critical_items`, `total_stock_value`. |
| GET | `/export-csv` | **CSV file** (not JSON): columns `material_code,item_name,category,unit,location,stock_qty,reorder_level,unit_cost,last_updated`. |
| GET | `/{code}` | JSON `data`: `{ "item": <InventoryItem> }` or 404. |
| POST | `/add` | JSON body creates row; `201` with `data.item_id`. |
| PUT | `/update/{code}` | JSON body merges fields; `data`: `{ "updated": true }`. |

**Consumption** — prefix: `/api/consumption` — `ConsumptionServlet`

| Method | Endpoint | Returns |
|--------|----------|---------|
| GET | `/` or `/history` | Query: `code`, `from`, `to`, `page`, `page_size`. JSON `data`: `{ "records": [...], "pagination": { page, page_size, total_records, total_pages } }`. |
| GET | `/monthly/{code}` | JSON `data`: `{ "monthly": [ { "month", "total" }, ... ] }`. |
| POST | `/record` | Body: `material_code`, `consumed_qty`, `consumption_date`, optional `department`, `remarks`. Inserts log and **decrements** `inventory_items.stock_qty`. `data`: `{ "log_id" }`. |
| PUT | `/edit/{log_id}` | Updates log; adjusts inventory by delta; optional `reason` in body. |
| DELETE | `/delete/{log_id}` | Optional `reason` query param; deletes log and **restores** stock. |

**Forecast** — prefix: `/api/forecast` — `ForecastServlet`

| Method | Endpoint | Returns |
|--------|----------|---------|
| GET | `/{code}?horizon=30` (or `60`, `90`) | JSON `data`: `material_code`, `horizon_days`, `cached` (bool), `forecast` (array of `{ds,yhat,yhat_lower,yhat_upper}`), `current_stock_qty`, `reorder_level`. Uses cache if valid; else Prophet via Flask if ≥6 monthly points; else in-process moving-average fallback. |
| GET | `/critical` | JSON `data`: `{ "critical": [ { material_code, stock_qty, avg_daily_consumption, days_to_zero_estimate }, ... ] }` for items with estimated days-to-zero ≤ 30 (based on last 90 days consumption). |
| GET | `/all?horizon=` | JSON `data`: `{ horizon_days, forecasts: { "<code>": [ ... ] }, errors: [ ... ] }` — **only** non-expired cached forecasts per item (no batch Prophet). |
| GET | `/reorder/{code}?horizon=` | Reorder suggestion: `reorder_qty`, `reorder_by_date`, stock fields. |
| POST | `/refresh/{code}?horizon=` | Same as GET `/{code}` but **forces** refresh (bypasses non-expired cache). |

**Charts** — prefix: `/api/charts` — `ChartServlet`

| Method | Endpoint | Returns |
|--------|----------|---------|
| GET | `/stock-levels` | Chart.js-style `{ labels: [material codes], datasets: [{ label, data: stock qty }] }`. |
| GET | `/consumption-trend/{code}` | Monthly totals per material: `labels` = `YYYY-MM`, `datasets` = monthly consumption. |
| GET | `/forecast/{code}` | Reads **cached** 30-day horizon from `forecast_cache` if not expired; Chart.js datasets for yhat/lower/upper. |
| GET | `/category-distribution` | Stock **value** by category: SQL `SUM(stock_qty * unit_cost)` grouped by `category`. |
| GET | `/department-consumption` | Stacked series: last **180 days**, grouped by month and department from `consumption_log`. |

**How the Java tier connects to the database**

- **`DBConnection`** builds a **`HikariDataSource`** using environment variables or Java system properties (see Section 2.5).
- DAOs (`InventoryDAO`, `ConsumptionDAO`, `ForecastDAO`) open connections via `DBConnection.getConnection()` and run prepared statements.
- There is **no** `application.properties` or `application.yml` in this project; configuration is **environment / system property** only (documented in `README.md` and `web.xml` comments).

#### Flask Forecasting Service

- **Role:** Runs **Facebook Prophet** on a time series `{ds, y}` and returns forecast rows for the horizon requested.
- **Why separate:** Prophet is a Python ecosystem library; keeping it in Flask isolates dependencies from the Java WAR.
- **How Java calls it:** `FlaskClient` POSTs JSON to `{SPAREAI_FLASK_URL}/forecast` with body `{ "data": [ {"ds":"...","y": n}, ... ], "periods": <horizon> }`. Default base URL: `http://localhost:5001`. Connect timeout **3 seconds**; forecast request timeout **60 seconds** (`ForecastServlet` → `FlaskClient.postJson`).
- **When forecasting runs:** On `GET` or `POST /api/forecast/{code}` when cache is missing/expired and monthly series length is **≥ 6**; otherwise Java uses a **moving-average fallback** without calling Flask.

**Flask HTTP API** (`app.py`):

| Method | Path | Body / response |
|--------|------|-----------------|
| GET | `/health` | `{ "status": "ok", "ts": "<ISO UTC>Z" }`. |
| POST | `/forecast` | JSON: `"data"` array of `{ds, y}`, `"periods"` default 30, integer **1–365**. Response: `{ "forecast": [ {ds, yhat, yhat_lower, yhat_upper}, ... ] }` (last `periods` rows of the future tail). |
| POST | `/forecast/components` | Same input; returns `{ "components": [ {ds, trend, ...yearly/weekly/daily if present} ] }` based on Prophet output columns. |

**Prophet model parameters in code** (`run_prophet` in `app.py`):

- `yearly_seasonality=True`
- `weekly_seasonality=False`
- `daily_seasonality=False`
- `seasonality_mode="multiplicative"`
- `changepoint_prior_scale=0.05`
- `make_future_dataframe(periods=periods, freq="D")` then `model.predict(future)`; response columns trimmed to **`ds`, `yhat`, `yhat_lower`, `yhat_upper`** for `/forecast`.

#### JSP Frontend Dashboard

- **How it is served:** Tomcat serves the WAR; the dashboard is at **`/ui/dashboard.jsp`** under the context path (e.g. `http://host:8080/spareai/ui/dashboard.jsp`).
- **How it loads assets:** `${pageContext.request.contextPath}` prefixes `/assets/spareai.css` and `/assets/spareai-dashboard.js`. Inline script sets `window.CONTEXT_PATH` for API calls.
- **How data is fetched:** `spareai-dashboard.js` uses **`fetch()`** against paths like `` `${CONTEXT_PATH}/api/inventory/summary` `` (see `apiFetch` / `api`).
- **Response shape:** Servlets wrap payloads as `{ "success": true, "data": ... }` (`JsonUtil.success`). The JS helper `api()` unwraps `data` when present.

**Five “pages” (single-page style via hash routing):**

| Hash / `data-page` | Section id | What it shows |
|--------------------|--------------|----------------|
| `overview` | `page-overview` | KPI tiles, quick stats, top consumed / closest to stockout mini-tables, monthly sparkline, alerts. Loads `/api/inventory/summary`, `/list`, `/low-stock`, `/forecast/critical`, `/consumption/history`. |
| `charts` | `page-charts` | Stock levels, category doughnut, department consumption, consumption trend, cumulative, compare materials. Uses `/api/charts/*` and `/api/inventory/list`. |
| `inventory` | `page-inventory` | Sortable/filterable table, client pagination (**25 rows per page**, `PAGE_SIZE` in JS). `/api/inventory/list`, `/api/forecast/critical` for consumption rate column. |
| `critical` | `page-critical` | Merged low-stock + forecast days-to-zero; tabs by severity; export CSV. `/api/inventory/low-stock`, `/api/forecast/critical`. |
| `forecast` | `page-forecast` | Material selector, horizon 30/60/90, uncertainty band toggle, Chart.js forecast + historical chart, procurement text box. `/api/forecast/{code}?horizon=`. |

**Chart.js:** Loaded from CDN (`chart.umd.min.js`); **zoom** plugin registered for forecast chart. Charts are created in JS (`new Chart(...)`) with datasets built from API JSON.

### 1.3 Request Workflow — Step by Step

**Example: User opens the dashboard and views the Overview page**

1. Browser requests `GET /{context}/ui/dashboard.jsp` (e.g. `/spareai/ui/dashboard.jsp`).
2. Tomcat compiles/serves the JSP as HTML; CSS/JS load from `/assets/...`.
3. On `DOMContentLoaded`, `bindRouter()` runs; `navigateTo("overview")` calls `loadOverviewPage()`.
4. JavaScript issues parallel `fetch` calls: `GET /api/inventory/summary`, `GET /api/inventory/list`, `GET /api/inventory/low-stock`, `GET /api/forecast/critical`, `GET /api/consumption/history`.
5. Tomcat routes each URL to the mapped servlet (`web.xml`); e.g. `InventoryServlet` handles `/api/inventory/*` using `req.getPathInfo()`.
6. DAOs query MySQL; results become Gson JSON with `{ success, data }`.
7. Browser receives JSON; `api()` unwraps `data`; KPI DOM nodes and tables update; `Chart` draws the monthly sparkline from consumption history.

**Example: User selects a material and views its forecast**

1. User chooses a material on the Forecast page and picks horizon (30/60/90 days).
2. JS calls `GET /api/forecast/{materialCode}?horizon={n}`.
3. `ForecastServlet.getForecastForCode` loads `InventoryItem`, checks `forecast_cache` for `(material_code, horizon)` not expired (`ForecastDAO.isExpired` compares `expires_at` to now).
4. If cache miss or expired: `ConsumptionDAO.prophetMonthlySeries(code)` builds monthly `{ds, y}` list.
5. If fewer than **6** months of points: Java builds a **moving-average** forecast JSON (no Flask).
6. Else: servlet builds JSON body `{ data: series, periods: horizon }` and **`FlaskClient.postJson("/forecast", ...)`** to the Flask base URL.
7. Flask `POST /forecast` runs Prophet, returns `forecast` array.
8. Java stores JSON in `forecast_cache` with **`expires_at` = now + 24 hours** (`ForecastDAO.save`).
9. Servlet responds with `forecast`, `current_stock_qty`, `reorder_level`, `cached` flag.
10. JS `loadForecastChart` builds Chart.js line chart (`yhat`, upper/lower band); loads historical chart via `GET /api/charts/consumption-trend/{code}`.

### 1.4 Data Flow Diagram

```
MySQL (inventory_items, consumption_log, forecast_cache, audit_log)
        ↓ JDBC
Java Servlets (DAO layer)
        ↓ JSON (/api/...)
Browser fetch() in spareai-dashboard.js
        ↓ datasets + labels
Chart.js canvas + HTML tables/KPIs
        ↓
User

(When Prophet path is used: Java → HTTP POST → Flask → Prophet → JSON forecast → Java persists cache → JSON to browser)
```

---

## 2. How to Embed SpareAI into an Organisation's Website

### 2.1 Standalone Deployment (Recommended)

SpareAI ships as a **single WAR** (`spareai.war`, final name from `pom.xml`) for **Apache Tomcat 10** (Jakarta EE 10 / Servlet 6).

**Typical steps:**

1. **Build the WAR:** from `spareai/` run `mvn -DskipTests package` — output: `spareai/target/spareai.war`.
2. **Deploy:** copy `spareai.war` to Tomcat’s `webapps/` directory. Tomcat expands it to a context folder named `spareai` by default.
3. **Configure MySQL:** create database and run `spareai/db/schema.sql` (see `README.md`).
4. **Set environment variables** for DB and Flask (Section 2.5), then start Tomcat.
5. **Start Flask:** from `spareai/flask-service/` install deps (`pip install -r requirements.txt`) and run `python app.py` (listens on **`0.0.0.0:5001`** per `app.py`).
6. **Open UI:** `http://your-server:8080/spareai/ui/dashboard.jsp` (adjust host/port/context).

**Changing the context path:** rename the WAR (e.g. `inventory.war`) or configure Tomcat’s `<Context path="...">` / `META-INF/context.xml` in the deployment — Tomcat determines the first URL segment after the host.

### 2.2 Embedding via iframe

Any site can embed the dashboard:

```html
<iframe 
  src="http://your-server:8080/spareai/ui/dashboard.jsp"
  width="100%" 
  height="900px"
  frameborder="0"
  style="border: none; border-radius: 8px;">
</iframe>
```

**When to use iframe:** fastest integration; no need to host the UI yourself.

**Limitations:** separate origin; cookies/storage for the iframe follow browser rules; `CorsFilter` affects `/api/*` when calling APIs from **another** origin (see 2.3). Session-wise, this app is mostly stateless JSON + static assets.

### 2.3 API-Only Integration

Another site can call the same REST endpoints the dashboard uses and render data in its own UI.

Example:

```javascript
fetch('http://your-server:8080/spareai/api/inventory/summary')
  .then(res => res.json())
  .then(body => {
    const data = body.data !== undefined ? body.data : body;
    // data.total_skus, data.critical_items, data.low_stock_count, data.total_stock_value
  });
```

**Useful endpoints for integration:** `GET /api/inventory/summary`, `GET /api/inventory/list`, `GET /api/inventory/low-stock`, `GET /api/forecast/critical`, `GET /api/forecast/{code}`, `GET /api/charts/department-consumption`, `GET /api/consumption/history`.

**CORS:** `com.spareai.util.CorsFilter` is mapped to `/api/*` in `web.xml`. It sets `Access-Control-Allow-Origin` to `*` when no `Origin` header, or echoes the request `Origin` when present; allows methods **GET, POST, PUT, DELETE, OPTIONS**; headers **Content-Type, Accept, X-Requested-With**; `Access-Control-Allow-Credentials: false`.

### 2.4 Reverse Proxy Setup (for production)

To expose SpareAI under a hostname or path, use a reverse proxy (Nginx, Apache HTTP Server, etc.). Example Nginx location:

```nginx
location /spareai/ {
    proxy_pass http://localhost:8080/spareai/;
    proxy_set_header Host $host;
}
```

> Note: Exact TLS termination, WebSocket needs, and upstream timeouts depend on your deployment policy.

### 2.5 Environment Variables Required

There is **no** `application.properties` in this repository. The following are read from **environment variables** or **Java system properties** (see `DBConnection`, `FlaskClient`, `README.md`, `web.xml`).

| Variable / property | Description | Default (from code if unset) |
|---------------------|-------------|------------------------------|
| `SPAREAI_DB_URL` or `spareai.db.url` | JDBC URL | `jdbc:mysql://localhost:3306/spareai?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC` |
| `SPAREAI_DB_USER` or `spareai.db.user` | DB username | `root` |
| `SPAREAI_DB_PASSWORD` or `spareai.db.password` | DB password | **Hardcoded default in `DBConnection.java`:** `shreyash@chaudhary1` — **override in production via env** |
| `SPAREAI_DB_POOL_SIZE` or `spareai.db.poolSize` | Hikari maximum pool size | `10` |
| `SPAREAI_FLASK_URL` or `spareai.flask.url` | Base URL for Prophet service | `http://localhost:5001` |

Flask service: no env-based port in code — port **5001** is fixed in `if __name__ == "__main__": app.run(..., port=5001)`.

---

## 3. How SpareAI Automatically Takes Data

### 3.1 Data Sources

In this codebase, operational data lives in **MySQL** tables defined in `db/schema.sql`. Typical organisational patterns (not implemented as separate modules here):

- **ERP / warehouse systems** that also write to the same MySQL schema or to tables replicated into it.
- **Direct database population** via SQL, ETL, or admin tools.
- **HTTP APIs:** `POST /api/consumption/record` and inventory `POST /add` / `PUT /update/{code}` can be used by integrations to push data.

There is **no** CSV upload endpoint in the Java code; inventory **CSV download** exists (`GET /api/inventory/export-csv`).

### 3.2 Database Connection

- The WAR uses **JDBC** with **HikariCP** (`DBConnection.getDataSource()`).
- Dashboard and API responses reflect **current committed rows** in MySQL at query time.
- SQL uses MySQL-specific functions (`DATE_FORMAT`, `CURDATE()`, `INTERVAL`) in chart and forecast helper queries — the app is **MySQL-oriented** as written.

### 3.3 How New Data Appears Automatically

Example: stock or consumption updated in the database

1. An upstream system (or API client) updates `inventory_items` or inserts into `consumption_log`.
2. The next browser `fetch` to `/api/inventory/list` (or other endpoints) runs fresh SQL.
3. Tables and charts in the UI show the new values.

> **Write behaviour:** Although the dashboard is **read-centric**, the backend **does** expose write APIs (`POST /api/consumption/record` decrements stock; inventory add/update). Those are explicit HTTP calls, not “magic” ERP sync.

### 3.4 Forecast Data Pipeline

1. Consumption rows in `consumption_log` provide history by `material_code` and `consumption_date`.
2. User selects a material on the Forecast page.
3. `ForecastServlet` aggregates monthly series via `ConsumptionDAO.prophetMonthlySeries` (`GROUP BY` month).
4. If enough history: JSON sent to Flask **`POST /forecast`** with `"periods"` equal to horizon (30/60/90).
5. Prophet returns daily forecast points with uncertainty columns.
6. Java persists the array in **`forecast_cache`** until **`expires_at`** (24 hours after generation in `ForecastDAO.save`).
7. `GET /api/forecast/{code}` returns JSON to the browser; Chart.js renders `yhat` and optional band.

### 3.5 Refresh Frequency

- **Dashboard data:** Loaded when each “page” section is first opened (`loaded[page]` guard) or when the user navigates again; **no** `setInterval` auto-refresh in `spareai-dashboard.js`.
- **Forecast cache:** **24 hours** TTL (`Instant.now().plus(24, ChronoUnit.HOURS)` in `ForecastDAO.save`). `ForecastDAO.isExpired` treats null `expires_at` as expired.
- **Forced refresh:** `POST /api/forecast/refresh/{code}?horizon=` bypasses a non-expired cache.

---

## 4. How Prophet Forecasting Works

### 4.1 What is Prophet?

**Prophet** is an open-source forecasting library (originally from Facebook / Meta) for **business time series** with trend and seasonality. SpareAI uses it (via Flask) to estimate future **consumption** for a spare part over a chosen horizon (**30, 60, or 90 days** in the Java API).

### 4.2 What Data Prophet Uses

- The Java tier sends a list of **`{ "ds": "<date>", "y": <number> }`** objects — monthly buckets from `consumption_log` (`prophetMonthlySeries` uses the first day of each month as `ds`).
- More history generally produces more stable forecasts; the Java code **requires at least 6 monthly points** to call Flask/Prophet, otherwise it uses a **simple moving-average fallback** in `ForecastServlet`.
- Prophet in Flask validates: non-empty `data`, numeric `periods` between **1 and 365**, valid dates in `ds`, numeric `y`.

### 4.3 What Prophet Outputs — Each Parameter Explained

The `/forecast` response rows (and cached JSON) use these fields:

#### ds — Forecast Date

> **What it is:** The calendar date for the forecast row.  
> **In plain English:** “This row is about this specific day.”  
> **Example:** `"2026-06-15"` means the prediction applies to 15 June 2026.

#### yhat — Predicted Consumption

> **What it is:** Prophet’s central estimate of consumption for that date.  
> **In plain English:** “About how much we expect to use that day.”  
> **How to use it:** Baseline planning number for replenishment discussions.  
> **Example:** `yhat = 2.4` means roughly 2.4 units that day (units follow your `consumed_qty` semantics).

#### yhat_lower — Lower Bound (Optimistic Scenario)

> **What it is:** Lower end of Prophet’s uncertainty interval for that date.  
> **In plain English:** “Demand might be as low as this.”  
> **How to use it:** Less aggressive stocking scenarios.  
> **On the chart:** Lower dashed boundary when the uncertainty band is enabled.  
> **Example:** `yhat_lower = 1.1`.

#### yhat_upper — Upper Bound (Pessimistic Scenario)

> **What it is:** Upper end of the uncertainty interval.  
> **In plain English:** “Demand could be as high as this.”  
> **How to use it:** Safety stock discussions for critical parts.  
> **On the chart:** Upper dashed boundary filling down to the lower series in Chart.js config.  
> **Example:** `yhat_upper = 3.8`.

#### trend — Underlying Trend

> **What it is:** In Prophet’s component view (`/forecast/components`), `trend` is the slowly changing level without seasonal bumps.  
> **In plain English:** “Are we generally using more or less over time?”  
> **Note:** The main dashboard chart uses **`yhat`**, not the `trend` series, unless you extend the app to plot components.

#### seasonal — Seasonal Component (if output)

> **What it is:** Prophet can expose `yearly` (and optionally `weekly` / `daily`) component columns. This project’s Flask model enables **yearly** seasonality only (`weekly_seasonality=False`, `daily_seasonality=False`).  
> **In plain English:** “Repeating yearly pattern on top of trend.”

#### The Uncertainty Band (yhat_lower to yhat_upper)

> **What it means together:** Forecasts are ranges, not guarantees. A wide band means volatile or sparse history; a narrow band means more consistent past usage.  
> **Rule of thumb for critical spares:** many teams plan toward the **upper** band; for non-critical items they may plan to **`yhat`**.

### 4.4 How to Read the Forecast Chart

- **Solid blue line (`yhat`):** central forecast from Prophet (or fallback average in low-history cases).
- **Shaded / dashed band:** upper and lower bounds when **“Band ON”** is active in the UI.
- **Historical chart (separate canvas):** built from **`GET /api/charts/consumption-trend/{code}`** — **monthly** totals, not the same daily granularity as Prophet output.
- **Where history ends vs forecast begins:** logically at “today” for Prophet rows (future dates start `LocalDate.now().plusDays(1)` in the moving-average fallback); for Prophet via Flask, dates come from Prophet’s future dataframe.

### 4.5 Forecast Accuracy and Limitations

- Accuracy improves with **more and cleaner** consumption history.
- One-off events (major shutdowns, large corrective maintenance) can distort learned patterns.
- Prophet assumes **future behaviour resembles past patterns**.
- Human review by procurement / maintenance is still essential.
- Java uses **90 days** of summed consumption to estimate **average daily** burn for `/api/forecast/critical`; the template’s “90 days minimum” is a reasonable operational guideline though the code’s Prophet gate is **6 monthly** aggregates.

---

## 5. Exact Data Requirements

### 5.1 Overview

SpareAI expects:

1. **Inventory master** in `inventory_items`.
2. **Consumption history** in `consumption_log` (for charts, critical estimates, and Prophet input).

### 5.2 Required Database Tables

#### Table 1: `inventory_items` (materials master)

| Column Name | Data Type (schema) | Required | Description |
|-------------|---------------------|----------|-------------|
| `item_id` | INT AUTO_INCREMENT | YES (PK) | Surrogate primary key. |
| `material_code` | VARCHAR(50) | YES | Unique material identifier (unique key `uq_inventory_material_code`). |
| `item_name` | VARCHAR(200) | YES | Description / name. |
| `category` | VARCHAR(100) | YES | Grouping for analytics. |
| `unit` | VARCHAR(20) | YES | Unit of measure (EA, KG, etc.). |
| `location` | VARCHAR(100) | NO | Stored as **location** in DB; UI maps “department” display from **`location`** in `spareai-dashboard.js` (`itemDepartment`). |
| `stock_qty` | DECIMAL(10,2) | YES | Current on-hand quantity (default 0). |
| `reorder_level` | DECIMAL(10,2) | YES | Reorder threshold (default 0). |
| `unit_cost` | DECIMAL(12,2) | NO | Cost per unit for value KPIs (nullable, treated as 0 in sums). |
| `last_updated` | TIMESTAMP | YES | Auto-maintained by MySQL `ON UPDATE CURRENT_TIMESTAMP`. |

#### Table 2: `consumption_log` (consumption history)

| Column Name | Data Type | Required | Description |
|-------------|-----------|----------|-------------|
| `log_id` | INT AUTO_INCREMENT | YES | Primary key. |
| `material_code` | VARCHAR(50) | YES | FK to `inventory_items.material_code`. |
| `consumed_qty` | DECIMAL(10,2) | YES | Positive quantity consumed/issued. |
| `consumption_date` | DATE | YES | Event date. |
| `department` | VARCHAR(100) | NO | Department label for charts/filters. |
| `remarks` | TEXT | NO | Free text. |
| `created_at` | TIMESTAMP | YES | Insert timestamp (default current). |

#### Table 3: `forecast_cache`

| Column Name | Description |
|-------------|-------------|
| `cache_id` | PK. |
| `material_code` | Material. |
| `forecast_horizon` | 30, 60, or 90 matching API. |
| `forecast_json` | JSON text of forecast array. |
| `generated_at`, `expires_at` | Cache timestamps (**24h** validity set in Java). |

#### Table 4: `audit_log`

| Column Name | Description |
|-------------|-------------|
| `audit_id` | PK. |
| `entity_type` | e.g. `consumption_log`. |
| `entity_id` | Related id. |
| `action` | `INSERT`, `UPDATE`, or `DELETE`. |
| `old_values`, `new_values` | JSON snapshots. |
| `changed_at` | Timestamp. |
| `source_ip` | Client IP for auditing. |

### 5.3 Minimum Data Requirements for Accurate Forecasting

| Requirement | Minimum implied by code | Recommended (operations) |
|-------------|-------------------------|----------------------------|
| Monthly history points for Prophet | **6** months (`prophetMonthlySeries` size) | 12–24+ months |
| Consumption rows per material | Enough to cover those months | Daily or weekly issues |
| Distinct materials | 1+ | Representative portfolio |
| `/forecast/critical` logic | Non-zero consumption in last **90** days | Steady logging |

### 5.4 Data Quality Rules

1. **`material_code`** must match between `inventory_items` and `consumption_log` (FK enforced).
2. **`consumption_date`** must be a valid SQL `DATE`.
3. **`consumed_qty`** should be **> 0** for API inserts (`ConsumptionServlet` validation); avoid negative manual SQL unless you understand stock effects.
4. Avoid future-dated consumption if you want realistic charts (not enforced in SQL).
5. **`stock_qty`** should be ≥ 0 for sensible KPIs (not enforced as CHECK constraint in schema).
6. **`reorder_level`** > 0 makes low/critical classifications meaningful.
7. **`department` / `location`**: inconsistent strings split metrics (e.g. `"WH-510"` vs `"WH510"`).

### 5.5 How to Connect Your Existing ERP Data

If ERP column names differ, create **MySQL views** that expose the column names SpareAI expects (`inventory_items` / `consumption_log`), or run an ETL job into these tables.

Example pattern (illustrative only — adjust to your ERP tables):

```sql
CREATE VIEW spareai_inventory_items AS
SELECT
  MATNR        AS material_code,
  MAKTX        AS item_name,
  MATKL        AS category,
  MEINS        AS unit,
  WERKS        AS location,
  LABST        AS stock_qty,
  EISBE        AS reorder_level,
  STPRS        AS unit_cost,
  NOW()        AS last_updated
FROM erp_material_valuation;
```

> The real app selects from table name **`inventory_items`**, not this view name, unless you rename or replace the table — coordinate with a DBA.

### 5.6 CSV Import Format (if supported)

**Server-side CSV export** for inventory exists: `GET /api/inventory/export-csv` with columns:

`material_code,item_name,category,unit,location,stock_qty,reorder_level,unit_cost,last_updated`

**CSV import** is **not implemented** in the Java servlets reviewed. To bulk load, use MySQL `LOAD DATA` or external ETL into `inventory_items` / `consumption_log`.

---

## 6. Quick Reference

### 6.1 All API Endpoints (summary table)

Inventory (`/api/inventory`): `GET /list`, `GET /low-stock`, `GET /summary`, `GET /export-csv`, `GET /{code}`, `POST /add`, `PUT /update/{code}`.

Consumption (`/api/consumption`): `GET /history`, `GET /monthly/{code}`, `POST /record`, `PUT /edit/{log_id}`, `DELETE /delete/{log_id}`.

Forecast (`/api/forecast`): `GET /{code}?horizon=`, `GET /critical`, `GET /all?horizon=`, `GET /reorder/{code}?horizon=`, `POST /refresh/{code}?horizon=`.

Charts (`/api/charts`): `GET /stock-levels`, `GET /consumption-trend/{code}`, `GET /forecast/{code}`, `GET /category-distribution`, `GET /department-consumption`.

Prefix all with the Tomcat context (e.g. `/spareai`).

### 6.2 Startup Checklist

- [ ] MySQL running with `spareai` database and `db/schema.sql` applied  
- [ ] `SPAREAI_DB_*` and `SPAREAI_FLASK_URL` set (do **not** rely on default password in production)  
- [ ] `pip install -r spareai/flask-service/requirements.txt`  
- [ ] Flask running (`python app.py` → port **5001**)  
- [ ] `mvn -DskipTests package` produced `target/spareai.war`  
- [ ] WAR deployed to Tomcat `webapps/`  
- [ ] Tomcat 10 started  
- [ ] Verify: `GET /spareai/api/inventory/list` returns `{ "success": true, "data": { "items": ... } }`  
- [ ] Verify: `/spareai/ui/dashboard.jsp` loads Overview  

### 6.3 Troubleshooting Common Issues

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Dashboard shows blank page | JS error before router | Browser DevTools console; verify `CONTEXT_PATH` and assets 200 OK |
| All tables show "No data" | DB empty or wrong credentials | Check MySQL data and env vars |
| Forecast chart empty / error | Flask down, or <6 months history using fallback returning empty in edge cases | Start Flask; add consumption history; check network to `SPAREAI_FLASK_URL` |
| Department chart missing | Parser hides section when shape empty | Ensure `consumption_log.department` populated; check `/api/charts/department-consumption` JSON |
| Dark mode issues | Theme-specific CSS | `body.dark-mode` rules in `spareai.css`; charts use `chartUiColors()` in JS |
| Only 25 inventory rows visible | Client `PAGE_SIZE=25` | Use pagination controls; data is still fully loaded from `/list` unless you change JS |

---

## 7. Glossary

- **Material Code:** Unique identifier for a spare part (`material_code`).
- **Reorder Level:** `reorder_level` — threshold for low-stock logic (`stock_qty <= reorder_level` in SQL).
- **Days to Zero:** Estimated days until stock runs out at recent average consumption (`days_to_zero_estimate` from `/api/forecast/critical`).
- **yhat:** Prophet’s central forecast value for a given `ds`.
- **Uncertainty Band:** Range from `yhat_lower` to `yhat_upper` around `yhat`.
- **WAR file:** Web Application Archive — packaged Java web app for Tomcat (`spareai.war`).
- **REST API:** HTTP JSON endpoints under `/api/...` served by Jakarta Servlets.
- **Prophet:** Meta’s open-source forecasting library used inside Flask.
- **Tomcat:** Apache Tomcat servlet container (version **10** for Jakarta EE 9+ namespace).
- **Flask:** Python microframework hosting the Prophet endpoints (`flask-service/app.py`).

---

*Document generated from repository source under `spareai/` as of the documentation authoring date.*
