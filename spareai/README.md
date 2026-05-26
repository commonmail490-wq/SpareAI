# SpareAI (Backend + Prophet Microservice)

## What’s included
- **Java backend**: Jakarta Servlets (Tomcat 10) + MySQL (JDBC via HikariCP)
- **Python microservice**: Flask + Prophet for forecasting
- **DB schema**: `db/schema.sql`
- **Stock Parameters**: per-material reorder and alert thresholds (`ParametersServlet`, dashboard page)

See **`DOCUMENTATION.md`** for the full API and UI reference.

## MySQL setup
1. Create database:

```sql
CREATE DATABASE spareai CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE spareai;
```

2. Run `db/schema.sql`.

3. If the database already existed before Stock Parameters, run once:

```sql
SOURCE db/add-material-parameters.sql;
```

4. Optional sample data: `spareai_real_data.sql`.

## Windows quick start

```cmd
copy set-local.bat.example set-local.bat
startup.bat
```

`startup.bat` builds the WAR, deploys to Tomcat, starts Tomcat and Flask. Use `redeploy.bat` after code changes.

## Backend configuration (Tomcat)
The backend reads DB + Flask settings from **environment variables** (preferred) or **Java system properties**.

### Environment variables
- `SPAREAI_DB_URL` (default: `jdbc:mysql://localhost:3306/spareai?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC`)
- `SPAREAI_DB_USER` (default: `root`)
- `SPAREAI_DB_PASSWORD` (default: see `DBConnection.java` — override in production)
- `SPAREAI_DB_POOL_SIZE` (default: `10`)
- `SPAREAI_FLASK_URL` (default: `http://localhost:5001`)

Deploy the built `spareai.war` to Tomcat 10 and access:
- Dashboard: `http://localhost:8080/spareai/ui/dashboard.jsp`
- API base: `http://localhost:8080/spareai/api`

### Key API prefixes
| Prefix | Servlet |
|--------|---------|
| `/api/inventory` | `InventoryServlet` |
| `/api/parameters` | `ParametersServlet` |
| `/api/consumption` | `ConsumptionServlet` |
| `/api/forecast` | `ForecastServlet` |
| `/api/charts` | `ChartServlet` |

**Parameters** (`/api/parameters`):
- `GET /list` — all materials with parameter fields and avg daily consumption
- `PUT /{material_code}` — update parameters for one material
- `POST /bulk` — body `{ "updates": [ ... ] }` for batch updates

## Flask service (Prophet)
From `flask-service/`:

```powershell
python app.py
```

Health check: `GET /health`  
Forecast: `POST /forecast` with body `{ "data": [{"ds":"YYYY-MM-DD","y":123}], "periods": 30 }`
