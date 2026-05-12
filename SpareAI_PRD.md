# SpareAI — Predictive Inventory Dashboard
## Product Requirements Document

| Field | Details |
|---|---|
| **Version** | 1.0 |
| **Date** | May 2026 |
| **Industry** | Inventory Management |
| **Frontend** | JSP, HTML5, CSS3, JavaScript, Bootstrap 5 |
| **Backend** | Java Servlets + Apache Tomcat |
| **ML Engine** | Python Flask + Facebook Prophet |
| **Database** | MySQL |
| **Visualisation** | Chart.js |
| **Authentication** | None — API-accessible program |

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Stakeholders & User Personas](#2-stakeholders--user-personas)
3. [Feature Requirements](#3-feature-requirements)
4. [System Architecture](#4-system-architecture)
5. [Database Schema](#5-database-schema)
6. [API Documentation](#6-api-documentation)
7. [Flask Forecast Microservice](#7-flask-forecast-microservice)
8. [Non-Functional Requirements](#8-non-functional-requirements)
9. [UI / UX Guidelines](#9-ui--ux-guidelines)
10. [Development Milestones](#10-development-milestones)
11. [Risks & Mitigations](#11-risks--mitigations)
12. [Glossary](#12-glossary)

---

## 1. Product Overview

### 1.1 Purpose

SpareAI is a Predictive Inventory Dashboard web application designed for the Inventory Management industry. It enables warehouse managers, procurement teams, and operations leads to monitor spare-parts inventory in real time, track consumption patterns, and receive AI-driven demand forecasts — all from a single browser-based interface. The system is exposed as an internal API and requires no user authentication.

### 1.2 Problem Statement

Industrial facilities frequently suffer stock-outs and over-stocking due to reactive, spreadsheet-based inventory practices. There is no centralised visibility into current stock levels, consumption rates, or future demand. This leads to unplanned downtime, excess carrying costs, and poor procurement decisions.

### 1.3 Goals

- Provide a real-time, browser-accessible inventory monitoring dashboard.
- Track part consumption automatically and surface consumption trends.
- Generate accurate demand forecasts using machine-learning (Facebook Prophet).
- Present all data through interactive graphical representations.
- Expose all functionality through well-documented REST API endpoints.

### 1.4 Scope

This document covers all four core feature areas identified in the SpareAI feature map:

- Inventory Monitoring Dashboard
- Consumption Tracking
- Predictive Demand Forecasting
- Graphical Representation

**Out of scope:** user authentication/authorisation, multi-tenant isolation, mobile native apps, ERP system integrations (phase 2).

---

## 2. Stakeholders & User Personas

| Persona | Role | Primary Needs |
|---|---|---|
| Warehouse Manager | Daily operations lead | Live stock levels, low-stock alerts, consumption history |
| Procurement Officer | Purchase order owner | Demand forecasts, reorder recommendations, supplier lead times |
| Operations Analyst | Data & reporting | Trend graphs, export-ready charts, forecast accuracy metrics |
| System Integrator | API consumer | Clean REST endpoints, JSON responses, Postman-testable routes |

---

## 3. Feature Requirements

### 3.1 Inventory Monitoring Dashboard

#### 3.1.1 Overview

The dashboard is the landing page of the application and provides a unified, real-time view of all inventory items. It is rendered via JSP and populated through AJAX calls to the Java Servlet backend.

#### 3.1.2 Functional Requirements

| ID | Requirement | Priority | Acceptance Criterion |
|---|---|---|---|
| FR-1.1 | Display real-time stock levels for all parts | Must Have | Stock quantity updates within 30 s of a DB change |
| FR-1.2 | Show part metadata: code, name, category, unit, location | Must Have | All fields visible in the item card/row |
| FR-1.3 | Highlight items below reorder threshold in red | Must Have | Items ≤ reorder_level rendered with red badge |
| FR-1.4 | KPI summary cards: Total SKUs, Low Stock Count, Critical Items, Total Stock Value | Must Have | Four summary cards visible at page top |
| FR-1.5 | Filter inventory by category, location, and stock status | Should Have | Filter panel updates table without page reload |
| FR-1.6 | Search parts by code or name | Should Have | Results appear with < 300 ms latency |
| FR-1.7 | Sortable table columns (quantity, value, name) | Could Have | Click on column header sorts ascending/descending |
| FR-1.8 | Export inventory snapshot to CSV | Could Have | CSV downloaded with correct headers and data |

---

### 3.2 Consumption Tracking

#### 3.2.1 Overview

Consumption tracking records every withdrawal or usage event against an inventory item. Data is stored in MySQL and exposed via REST APIs. The JSP interface allows manual entry of consumption events and displays historical logs.

#### 3.2.2 Functional Requirements

| ID | Requirement | Priority | Acceptance Criterion |
|---|---|---|---|
| FR-2.1 | Record consumption event: part code, quantity, date, department | Must Have | POST API stores record and decrements stock_qty |
| FR-2.2 | List consumption history with date-range filter | Must Have | GET API returns paginated records for selected range |
| FR-2.3 | Show monthly consumption totals per part | Must Have | Aggregated totals visible in history view |
| FR-2.4 | Detect consumption spikes (> 2× 3-month average) | Should Have | Spike flagged with warning indicator in table |
| FR-2.5 | Edit or delete a consumption record (with reason) | Should Have | Audit log entry created on every edit/delete |
| FR-2.6 | Bulk upload consumption via CSV | Could Have | CSV parsed, validated, imported; errors reported row by row |

---

### 3.3 Predictive Demand Forecasting

#### 3.3.1 Overview

The forecasting engine is a Python Flask microservice that wraps Facebook Prophet. The Java Servlet backend calls this Flask API via HTTP/REST whenever a forecast is requested. Forecast results are stored in MySQL for caching and displayed on the JSP frontend.

#### 3.3.2 Functional Requirements

| ID | Requirement | Priority | Acceptance Criterion |
|---|---|---|---|
| FR-3.1 | Generate 30/60/90-day demand forecast per part using Prophet | Must Have | Forecast JSON returned within 5 s for single part |
| FR-3.2 | Display forecast alongside confidence interval (yhat_lower, yhat_upper) | Must Have | Upper/lower bounds rendered as shaded band on chart |
| FR-3.3 | Recommend reorder quantity based on forecast and safety stock | Must Have | Reorder recommendation card visible per part |
| FR-3.4 | Highlight parts predicted to hit zero stock within 30 days | Must Have | Critical forecast badge shown; listed in priority table |
| FR-3.5 | Cache forecast in MySQL; invalidate after 24 hours | Should Have | Repeat API call within 24 h returns cached result instantly |
| FR-3.6 | Support seasonal decomposition toggle in UI | Should Have | Trend, seasonality, residual components displayable |
| FR-3.7 | Batch forecast for all parts via scheduled job (daily) | Should Have | Cron or scheduler runs forecast refresh every 24 h |
| FR-3.8 | MAE/RMSE accuracy metrics displayed per part | Could Have | Metrics shown in forecast detail panel |

#### 3.3.3 Prophet Dataset Format

The Flask API expects consumption data in the following format before running Prophet:

| Column | Type | Description |
|---|---|---|
| `ds` | DATE (YYYY-MM-DD) | Observation date (monthly granularity minimum) |
| `y` | DECIMAL(10,2) | Quantity consumed or procured |
| `material_code` | VARCHAR(50) | Unique part/material identifier |

**Example:**

```
ds          | y   | material_code
------------|-----|---------------
2024-01-01  | 120 | RM101
2024-02-01  | 140 | RM101
2024-03-01  | 110 | RM101
```

---

### 3.4 Graphical Representation

#### 3.4.1 Overview

All charts are rendered client-side using Chart.js via JSP templates. Data is fetched from the Servlet REST APIs as JSON and passed to Chart.js at page load or on demand via AJAX.

#### 3.4.2 Chart Inventory

| Chart ID | Chart Type | Data Source | Purpose |
|---|---|---|---|
| CH-01 | Bar Chart | Inventory API | Current stock level per part — horizontal bar |
| CH-02 | Line Chart | Consumption API | Monthly consumption trend per selected part |
| CH-03 | Line + Confidence Band | Forecast API | Forecasted demand with yhat_lower / yhat_upper bounds |
| CH-04 | Pie / Doughnut Chart | Inventory API | Stock distribution by category |
| CH-05 | Stacked Bar Chart | Consumption API | Department-wise consumption comparison per month |
| CH-06 | Gauge / KPI Widget | Inventory API | Stock health score (% parts above reorder threshold) |
| CH-07 | Heat Map | Consumption API | Day-of-month consumption heat map per part |

#### 3.4.3 Non-Functional Charting Requirements

- Charts must render within 2 seconds of data fetch.
- All charts must be responsive — resize correctly on viewport change.
- Charts must include tooltips, legends, and downloadable PNG option.
- Colour palette must be colour-blind-accessible (WCAG AA compliant).

---

## 4. System Architecture

### 4.1 High-Level Component Diagram

The application follows a three-tier architecture with an additional Python microservice for ML forecasting:

```
┌─────────────────────────────────────────────┐
│              Browser (JSP + Chart.js)        │
│   dashboard.jsp | consumption.jsp |           │
│   forecast.jsp  | analytics.jsp               │
└───────────────────┬─────────────────────────┘
                    │ HTTP / AJAX (JSON)
┌───────────────────▼─────────────────────────┐
│         Java Servlet Layer (Tomcat)          │
│   /api/inventory  /api/consumption            │
│   /api/forecast   /api/charts                 │
└──────────┬────────────────────┬──────────────┘
           │ JDBC               │ HTTP REST
┌──────────▼────────┐  ┌────────▼──────────────┐
│      MySQL        │  │  Python Flask + Prophet │
│  inventory_items  │  │  POST /forecast         │
│  consumption_log  │  │  POST /forecast/components│
│  forecast_cache   │  │  GET  /health           │
│  audit_log        │  └───────────────────────┘
└───────────────────┘
```

### 4.2 Request Flow

1. User opens dashboard JSP page in browser.
2. JSP page fires AJAX GET to Java Servlet (e.g., `/api/inventory/list`).
3. Servlet queries MySQL via JDBC and returns JSON response.
4. JSP JavaScript receives JSON and renders Chart.js visualisations.
5. For forecasting: Servlet calls Python Flask API (`POST /forecast`) with consumption data.
6. Flask runs Prophet model and returns forecast JSON to Servlet.
7. Servlet caches result in MySQL forecast table and returns to browser.

### 4.3 Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | JSP, HTML5, CSS3, JavaScript, Bootstrap 5 | Server-side rendered templates; Chart.js for visualisations |
| Backend | Java Servlets + Apache Tomcat | No framework — pure Servlet API; JSON via Gson or Jackson |
| ML Backend | Python Flask + Facebook Prophet | Lightweight REST microservice; runs in Python virtual environment |
| Database | MySQL | Relational; JDBC for Java connectivity |
| Visualisation | Chart.js (CDN) | Canvas-based; responsive; extensive chart type support |
| API Format | REST + JSON | All Servlet endpoints return `application/json` |
| Authentication | None (API access) | No session/auth — application called as internal API |
| Deployment | Tomcat + MySQL + Python venv | Single server or Docker Compose acceptable |

---

## 5. Database Schema

### 5.1 Table: `inventory_items`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `item_id` | INT | PK, AUTO_INCREMENT | Unique part identifier |
| `material_code` | VARCHAR(50) | UNIQUE, NOT NULL | Business part code (e.g. RM101) |
| `item_name` | VARCHAR(200) | NOT NULL | Descriptive name of the part |
| `category` | VARCHAR(100) | NOT NULL | Part category (electrical, mechanical, etc.) |
| `unit` | VARCHAR(20) | NOT NULL | Unit of measure (pcs, kg, litre) |
| `location` | VARCHAR(100) | — | Warehouse shelf/bin location |
| `stock_qty` | DECIMAL(10,2) | NOT NULL, DEFAULT 0 | Current quantity on hand |
| `reorder_level` | DECIMAL(10,2) | NOT NULL | Quantity threshold triggering low-stock alert |
| `unit_cost` | DECIMAL(12,2) | — | Cost per unit (for stock value calculation) |
| `last_updated` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Auto-updated on every change |

### 5.2 Table: `consumption_log`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `log_id` | INT | PK, AUTO_INCREMENT | Unique log entry identifier |
| `material_code` | VARCHAR(50) | FK → inventory_items | Part reference |
| `consumed_qty` | DECIMAL(10,2) | NOT NULL | Quantity withdrawn/used |
| `consumption_date` | DATE | NOT NULL | Date of the consumption event |
| `department` | VARCHAR(100) | — | Department or work order that consumed the part |
| `remarks` | TEXT | — | Optional note or reason |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Record creation timestamp |

### 5.3 Table: `forecast_cache`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `cache_id` | INT | PK, AUTO_INCREMENT | Cache entry identifier |
| `material_code` | VARCHAR(50) | NOT NULL | Part code for which forecast was generated |
| `forecast_horizon` | INT | NOT NULL | Days ahead (30, 60, or 90) |
| `forecast_json` | LONGTEXT | NOT NULL | Full Prophet output as JSON string |
| `generated_at` | TIMESTAMP | NOT NULL | When the forecast was computed |
| `expires_at` | TIMESTAMP | NOT NULL | generated_at + 24 hours; Servlet checks before recomputing |

### 5.4 Table: `audit_log`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `audit_id` | INT | PK, AUTO_INCREMENT | Audit record identifier |
| `entity_type` | VARCHAR(50) | NOT NULL | Table name affected (inventory_items, consumption_log) |
| `entity_id` | INT | NOT NULL | PK of the affected row |
| `action` | ENUM | NOT NULL | INSERT, UPDATE, DELETE |
| `old_values` | JSON | — | Snapshot of row before change |
| `new_values` | JSON | — | Snapshot of row after change |
| `changed_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Timestamp of change |
| `source_ip` | VARCHAR(45) | — | IP address of API caller |

---

## 6. API Documentation

All endpoints are served by the Java Servlet layer. No authentication headers are required.

**Base URL:** `http://<host>:8080/spareai/api`

### Standard Response Shapes

**Success:**
```json
{ "success": true, "data": { ... } }
```

**Error:**
```json
{ "success": false, "error": { "code": "ERROR_CODE", "message": "Human readable message" } }
```

**HTTP Status Codes:**

| Status | Meaning |
|---|---|
| 200 OK | Successful GET or PUT |
| 201 Created | Successful POST (new resource created) |
| 400 Bad Request | Validation error — missing or invalid field |
| 404 Not Found | material_code or log_id not found in DB |
| 500 Internal Server Error | Unhandled exception in Servlet or Flask |

---

### 6.1 Inventory APIs

| Method | Endpoint | Description | Response |
|---|---|---|---|
| GET | `/inventory/list` | Return all inventory items with current stock | `{ "items": [...], "total": N }` |
| GET | `/inventory/{code}` | Single item by material_code | `{ "item": { ... } }` |
| POST | `/inventory/add` | Add a new inventory item | `{ "success": true, "item_id": N }` |
| PUT | `/inventory/update/{code}` | Update stock level or metadata | `{ "success": true }` |
| GET | `/inventory/low-stock` | Items at or below reorder threshold | `{ "critical": [...] }` |
| GET | `/inventory/summary` | KPI aggregates (total SKUs, low stock count, stock value) | `{ "kpis": { ... } }` |
| GET | `/inventory/export-csv` | CSV download of full inventory snapshot | CSV file (text/csv) |

#### Example: GET `/inventory/summary`

```json
{
  "success": true,
  "data": {
    "total_skus": 342,
    "low_stock_count": 18,
    "critical_items": 5,
    "total_stock_value": 1482300.00
  }
}
```

---

### 6.2 Consumption APIs

| Method | Endpoint | Description | Response |
|---|---|---|---|
| POST | `/consumption/record` | Log a new consumption event | `{ "success": true, "log_id": N }` |
| GET | `/consumption/history` | Paginated log `?from=&to=&code=&page=` | `{ "records": [...], "pagination": { ... } }` |
| GET | `/consumption/monthly/{code}` | Monthly aggregated totals for a part | `{ "monthly": [{ "month": "2026-04", "total": 120 }] }` |
| PUT | `/consumption/edit/{log_id}` | Edit a consumption record | `{ "success": true }` |
| DELETE | `/consumption/delete/{log_id}` | Delete a consumption record | `{ "success": true }` |
| POST | `/consumption/bulk-upload` | Upload CSV of consumption events | `{ "imported": N, "errors": [...] }` |

#### Example: POST `/consumption/record`

**Request Body:**
```json
{
  "material_code": "RM101",
  "consumed_qty": 25,
  "consumption_date": "2026-05-08",
  "department": "Maintenance",
  "remarks": "Scheduled replacement"
}
```

**Response:**
```json
{ "success": true, "log_id": 4821 }
```

---

### 6.3 Forecasting APIs

| Method | Endpoint | Description | Response |
|---|---|---|---|
| GET | `/forecast/{code}?horizon=30` | Demand forecast for one part (30/60/90 days) | `{ "forecast": [{ "ds": "...", "yhat": ..., "yhat_lower": ..., "yhat_upper": ... }] }` |
| GET | `/forecast/all?horizon=30` | Batch forecast for all parts | `{ "forecasts": { "RM101": [...], ... } }` |
| GET | `/forecast/reorder/{code}` | Reorder recommendation for a part | `{ "reorder_qty": N, "reorder_by_date": "..." }` |
| GET | `/forecast/critical` | Parts forecast to reach zero within 30 days | `{ "critical": [...] }` |
| POST | `/forecast/refresh/{code}` | Force-refresh forecast cache for a part | `{ "success": true }` |

#### Example: GET `/forecast/RM101?horizon=30`

```json
{
  "success": true,
  "data": {
    "material_code": "RM101",
    "horizon_days": 30,
    "cached": false,
    "forecast": [
      { "ds": "2026-05-09", "yhat": 132.4, "yhat_lower": 118.1, "yhat_upper": 146.7 },
      { "ds": "2026-05-10", "yhat": 135.0, "yhat_lower": 120.3, "yhat_upper": 149.2 }
    ]
  }
}
```

---

### 6.4 Chart Data APIs

| Method | Endpoint | Returns (Chart.js-ready JSON) |
|---|---|---|
| GET | `/charts/stock-levels` | `{ labels: [...], datasets: [{ data: [...] }] }` for CH-01 bar chart |
| GET | `/charts/consumption-trend/{code}` | Time-series line data for CH-02 |
| GET | `/charts/forecast/{code}` | Forecast + confidence band datasets for CH-03 |
| GET | `/charts/category-distribution` | Pie/doughnut dataset for CH-04 |
| GET | `/charts/department-consumption` | Stacked bar datasets for CH-05 |

---

## 7. Flask Forecast Microservice

### 7.1 Overview

The Flask service is a standalone Python application running on a separate port (default: **5001**). The Java Servlet communicates with it via HTTP POST requests. It does not connect to the database directly — the Servlet passes the consumption data as JSON.

### 7.2 Flask Endpoints

| Method | Endpoint | Request Body | Response |
|---|---|---|---|
| POST | `/forecast` | `{ "data": [{"ds":"...","y":...}], "periods": 30 }` | `{ "forecast": [{"ds":"...","yhat":...,"yhat_lower":...,"yhat_upper":...}] }` |
| POST | `/forecast/components` | Same as `/forecast` | `{ "trend": [...], "seasonality": [...] }` |
| GET | `/health` | None | `{ "status": "ok" }` |

### 7.3 Python Dependencies

```
flask
prophet
pandas
scikit-learn
```

### 7.4 Example Flask Route

```python
from flask import Flask, request, jsonify
from prophet import Prophet
import pandas as pd

app = Flask(__name__)

@app.route('/forecast', methods=['POST'])
def forecast():
    body = request.get_json()
    df = pd.DataFrame(body['data'])        # expects [{"ds":"...","y":...}]
    df['ds'] = pd.to_datetime(df['ds'])
    
    model = Prophet()
    model.fit(df)
    
    future = model.make_future_dataframe(periods=body.get('periods', 30))
    result = model.predict(future)
    
    output = result[['ds', 'yhat', 'yhat_lower', 'yhat_upper']].tail(body.get('periods', 30))
    return jsonify({ "forecast": output.to_dict(orient='records') })

if __name__ == '__main__':
    app.run(port=5001)
```

---

## 8. Non-Functional Requirements

| Category | Target | Notes |
|---|---|---|
| Performance | API response < 500 ms (non-forecast) | JDBC query optimisation; index on material_code and consumption_date |
| Performance | Forecast < 5 s (single part) | 24-hour cache prevents repeated Prophet runs |
| Availability | 99% uptime during business hours | Tomcat and MySQL should run as OS services with restart policy |
| Scalability | Support up to 10,000 inventory SKUs | Paginated APIs; MySQL indexes; forecast batch jobs off-peak |
| Usability | Dashboard usable on 1920×1080 and 1366×768 | Bootstrap 5 responsive grid; Chart.js responsive option |
| Browser Support | Chrome 110+, Firefox 110+, Edge 110+ | No IE support required |
| Data Integrity | No consumption record lost on Servlet restart | ACID-compliant MySQL transactions; rollback on JDBC exception |
| Maintainability | All SQL in DAO classes only | No inline SQL in Servlet controllers; follow DAO pattern |
| Portability | Deployable on Windows and Linux | Tomcat + MySQL + Python venv are cross-platform |

---

## 9. UI / UX Guidelines

### 9.1 JSP Page Structure

| Page | JSP File | Primary Components |
|---|---|---|
| Dashboard Home | `dashboard.jsp` | KPI cards, stock level bar chart, low-stock alert table |
| Consumption Log | `consumption.jsp` | Date-range filter, consumption table, monthly trend line chart |
| Forecast Detail | `forecast.jsp` | Part selector, forecast line + confidence band, reorder card |
| Analytics | `analytics.jsp` | Category doughnut, department stacked bar, health gauge |
| Part Detail | `part-detail.jsp` | Part metadata, consumption history, forecast summary panel |

### 9.2 Design Principles

- **Information density:** critical alerts above the fold; secondary data below.
- **Consistent colour coding:** red = critical/low stock; amber = warning; green = healthy.
- All data tables must support sorting, filtering, and CSV export.
- Loading spinners displayed for all AJAX operations > 200 ms.
- Empty states: meaningful message and CTA when no data exists.

### 9.3 Folder Structure

```
spareai/
├── src/
│   ├── main/
│   │   ├── java/
│   │   │   └── com/spareai/
│   │   │       ├── servlets/
│   │   │       │   ├── InventoryServlet.java
│   │   │       │   ├── ConsumptionServlet.java
│   │   │       │   ├── ForecastServlet.java
│   │   │       │   └── ChartServlet.java
│   │   │       ├── dao/
│   │   │       │   ├── InventoryDAO.java
│   │   │       │   ├── ConsumptionDAO.java
│   │   │       │   └── ForecastDAO.java
│   │   │       ├── model/
│   │   │       │   ├── InventoryItem.java
│   │   │       │   ├── ConsumptionLog.java
│   │   │       │   └── ForecastCache.java
│   │   │       └── util/
│   │   │           ├── DBConnection.java
│   │   │           └── FlaskClient.java
│   │   └── webapp/
│   │       ├── WEB-INF/web.xml
│   │       ├── dashboard.jsp
│   │       ├── consumption.jsp
│   │       ├── forecast.jsp
│   │       ├── analytics.jsp
│   │       ├── part-detail.jsp
│   │       ├── css/
│   │       └── js/
├── flask-service/
│   ├── app.py
│   ├── requirements.txt
│   └── venv/
└── db/
    └── schema.sql
```

---

## 10. Development Milestones

| Phase | Name | Deliverables | Target |
|---|---|---|---|
| 1 | Foundation | MySQL schema creation, JDBC connection pool, Servlet project scaffold, Flask health endpoint | Week 1–2 |
| 2 | Inventory Module | Inventory CRUD Servlets, `inventory.jsp` dashboard page, KPI summary API, low-stock alert API | Week 3–4 |
| 3 | Consumption Module | Consumption log APIs, `consumption.jsp`, monthly aggregation, Chart CH-01 & CH-02 | Week 5–6 |
| 4 | Forecast Module | Flask Prophet integration, forecast APIs, forecast cache, reorder recommendations, CH-03 | Week 7–9 |
| 5 | Analytics & Charts | All remaining Chart.js charts (CH-04 to CH-07), `analytics.jsp`, `part-detail.jsp` | Week 10–11 |
| 6 | QA & Polish | End-to-end testing, performance tuning, CSV export, bulk upload, error handling review | Week 12 |

---

## 11. Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Insufficient historical consumption data for Prophet to converge | High | Minimum 12 months of data required; display warning if < 6 months; fallback to moving average |
| Flask microservice unavailable causing Servlet to block | High | Implement HTTP timeout (5 s) on Servlet → Flask call; return cached forecast or graceful error |
| MySQL query performance degradation with large consumption_log | Medium | Composite index on (material_code, consumption_date); pagination on all list APIs |
| Prophet installation complexity on target server | Medium | Provide `requirements.txt` and venv setup script; document known dependency conflicts |
| JDBC connection pool exhaustion under concurrent API calls | Medium | Configure max pool size in `context.xml`; use connection pool library (e.g. HikariCP) |
| Chart.js rendering performance with large datasets (> 5000 points) | Low | Downsample data server-side before sending to chart APIs; use Chart.js decimation plugin |

---

## 12. Glossary

| Term | Definition |
|---|---|
| SKU | Stock Keeping Unit — a unique identifier for an inventory item |
| Reorder Level | Minimum stock quantity below which a replenishment order should be raised |
| Prophet | Open-source forecasting library by Meta (Facebook) based on additive time-series models |
| `yhat` | Prophet notation for the forecasted (predicted) value at a given date |
| `yhat_lower` / `yhat_upper` | Lower and upper bounds of the Prophet forecast confidence interval |
| MAE | Mean Absolute Error — average magnitude of forecast errors |
| RMSE | Root Mean Square Error — standard deviation of forecast residuals |
| JDBC | Java Database Connectivity — standard Java API for relational database access |
| JSP | JavaServer Pages — server-side Java templating technology for HTML generation |
| DAO | Data Access Object — design pattern that abstracts database operations |
| Servlet | Java class that handles HTTP requests and generates responses |
| Flask | Lightweight Python web framework used here as the ML microservice host |
| `ds` | The date column fed to Prophet — must be in YYYY-MM-DD format |
| `y` | The value column fed to Prophet — quantity consumed or procured |

---

*Confidential — For Development Use Only | SpareAI v1.0 | May 2026*
