# SpareAI (Backend + Prophet Microservice)

## What’s included
- **Java backend**: Jakarta Servlets (Tomcat 10) + MySQL (JDBC via HikariCP)
- **Python microservice**: Flask + Prophet for forecasting
- **DB schema**: `db/schema.sql`

## MySQL setup
1. Create database:

```sql
CREATE DATABASE spareai CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE spareai;
```

2. Run `db/schema.sql`.

## Backend configuration (Tomcat)
The backend reads DB + Flask settings from **environment variables** (preferred) or **Java system properties**.

### Environment variables
- `SPAREAI_DB_URL` (default: `jdbc:mysql://localhost:3306/spareai?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC`)
- `SPAREAI_DB_USER` (default: `root`)
- `SPAREAI_DB_PASSWORD` (default: empty)
- `SPAREAI_DB_POOL_SIZE` (default: `10`)
- `SPAREAI_FLASK_URL` (default: `http://localhost:5001`)

### Example (PowerShell)

```powershell
$env:SPAREAI_DB_PASSWORD="YOUR_MYSQL_PASSWORD"
$env:SPAREAI_FLASK_URL="http://localhost:5001"
```

Deploy the built `spareai.war` to Tomcat 10 and access:
- API base: `http://localhost:8080/spareai/api`

## Flask service (Prophet)
From `spareai/flask-service/`:

```powershell
python app.py
```

Health check:
- `GET /health`

Forecast:
- `POST /forecast` with body `{ "data": [{"ds":"YYYY-MM-DD","y":123}], "periods": 30 }`

