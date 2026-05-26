# SpareAI (BSP)

SpareAI is a predictive inventory dashboard for spare-parts management. The repository contains:

- A Java servlet backend packaged as a WAR for Apache Tomcat 10
- A Python Flask microservice that runs Facebook Prophet forecasts
- MySQL schema and sample data
- Prophet training datasets and product documentation

The web UI is served from Tomcat. Forecast requests go from the Java API to the Flask service on port `5001`.

**Dashboard features:** Overview KPIs, charts, inventory table, critical stock, demand forecast, and **Stock Parameters** (per-material reorder levels and alert thresholds with Excel-based and consumption-based preset defaults).

## What you need

Install these tools on Windows before you run the project. Use **Command Prompt (cmd.exe)** for the commands in this guide unless a step says otherwise.

| Software | Version used in this project | Why you need it |
|---|---|---|
| Java JDK | 24 | Compiles and runs the servlet backend |
| Apache Maven | 3.9+ | Builds `spareai.war` |
| Apache Tomcat | 10.1.x | Hosts the Java web application |
| MySQL Server | 8.0+ | Stores inventory, consumption, and forecast cache data |
| Python | 3.11 recommended | Runs the Flask forecast service |
| Git | Latest stable | Clones and updates this repository |

Optional but useful:

- MySQL Workbench for database setup and inspection
- A browser for the dashboard and API checks

## Download and install prerequisites

### 1. Install Java JDK 24

1. Open [Oracle JDK downloads](https://www.oracle.com/java/technologies/downloads/) or [Adoptium Temurin](https://adoptium.net/).
2. Download the Windows x64 JDK 24 installer.
3. Run the installer and keep the default install path unless you have a reason to change it.
4. Open a new Command Prompt window and verify the install:

```cmd
java -version
javac -version
```

You should see Java 24 in the output.

### 2. Install Apache Maven

1. Open the [Apache Maven download page](https://maven.apache.org/download.cgi).
2. Download the binary zip archive, for example `apache-maven-3.9.15-bin.zip`.
3. Extract it to a folder such as `D:\maven\apache-maven-3.9.15`.
4. Add Maven to your user `PATH`:
   - Open **Settings** -> **System** -> **About** -> **Advanced system settings** -> **Environment Variables**.
   - Under **User variables**, edit `Path`.
   - Add the `bin` folder, for example `D:\maven\apache-maven-3.9.15\bin`.
5. Open a new Command Prompt window and verify:

```cmd
mvn -version
```

### 3. Install Apache Tomcat 10

1. Open the [Apache Tomcat 10 download page](https://tomcat.apache.org/download-10.cgi).
2. Download the Windows zip distribution for Tomcat 10.1.
3. Extract it to a folder such as `C:\apache-tomcat-10.1.44`.
4. Optional: add `C:\apache-tomcat-10.1.44\bin` to your user `PATH` so you can run `catalina.bat` from any folder.
5. Verify Tomcat starts:

```cmd
cd /d C:\apache-tomcat-10.1.44\bin
startup.bat
```

6. Open `http://localhost:8080` in your browser. Stop Tomcat when you are done testing:

```cmd
cd /d C:\apache-tomcat-10.1.44\bin
shutdown.bat
```

Tomcat 10 is required because the backend uses Jakarta Servlet 6.

### 4. Install MySQL Server 8

1. Open the [MySQL Community downloads page](https://dev.mysql.com/downloads/mysql/).
2. Download **MySQL Installer for Windows**.
3. Run the installer and choose **Server only** or **Developer Default**.
4. Set a root password during setup and remember it.
5. Keep the default port `3306` unless another service already uses it.
6. Verify MySQL is running:

```cmd
mysql --version
```

If `mysql` is not recognized, add the MySQL `bin` folder to your `PATH` or use MySQL Workbench for the database steps below.

### 5. Install Python 3.11

1. Open the [Python downloads page](https://www.python.org/downloads/windows/).
2. Download Python 3.11.x for Windows.
3. Run the installer.
4. Check **Add python.exe to PATH**.
5. Verify in a new Command Prompt window:

```cmd
python --version
pip --version
```

Prophet installs more easily on Python 3.11 than on newer Python releases.

## Get the project

Clone the repository, then move into the project folder:

```cmd
git clone https://github.com/<your-github-username>/SpareAI.git
cd SpareAI
```

If you already have the source locally, `cd` into the repository root instead.

## Configure the database

### Create the database

Using the MySQL command line client:

```cmd
mysql -u root -p
```

Run:

```sql
CREATE DATABASE spareai CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE spareai;
SOURCE spareai/db/schema.sql;
```

Optional sample data:

```sql
SOURCE spareai/spareai_real_data.sql;
```

**Existing databases** (created before Stock Parameters): apply the column migration once:

```sql
SOURCE spareai/db/add-material-parameters.sql;
```

Or from Command Prompt:

```cmd
cd spareai\db
apply-material-parameters.bat
```

You can run the same SQL files from MySQL Workbench if you prefer a GUI.

### Set database credentials for the Java backend

The backend reads settings from environment variables first, then Java system properties.

In Command Prompt, set these before you start Tomcat:

```cmd
set SPAREAI_DB_URL=jdbc:mysql://localhost:3306/spareai?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC
set SPAREAI_DB_USER=root
set SPAREAI_DB_PASSWORD=YOUR_MYSQL_PASSWORD
set SPAREAI_DB_POOL_SIZE=10
set SPAREAI_FLASK_URL=http://localhost:5001
```

Replace `YOUR_MYSQL_PASSWORD` with the password you chose during MySQL installation.

## Set up the Flask forecast service

Open a **first** Command Prompt window for the Python service.

```cmd
cd spareai\flask-service
python -m venv .venv
.venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt
python app.py
```

The first Prophet install can take several minutes because it downloads scientific dependencies.

When the service is ready, you should see Flask listening on port `5001`.

Health check:

```cmd
curl http://localhost:5001/health
```

Leave this Command Prompt window open while you use the application.

## Build and run (Windows scripts)

Copy `spareai\set-local.bat.example` to `spareai\set-local.bat` and set your Tomcat path (`CATALINA_HOME`) if it differs from the default.

From the repository root, **`spareai\startup.bat`** does the following in order:

1. Start MySQL (`MySQL80` service)
2. Build `spareai.war` with Maven
3. Remove the old exploded app and copy the new WAR to Tomcat `webapps\`
4. Start Tomcat
5. Start the Flask forecast service

```cmd
cd spareai
startup.bat
```

To rebuild and redeploy only (Tomcat already configured):

```cmd
cd spareai
redeploy.bat
```

Set backend environment variables before starting Tomcat if you are not using defaults (same session as Tomcat, or system-wide):

```cmd
set SPAREAI_DB_URL=jdbc:mysql://localhost:3306/spareai?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC
set SPAREAI_DB_USER=root
set SPAREAI_DB_PASSWORD=YOUR_MYSQL_PASSWORD
set SPAREAI_FLASK_URL=http://localhost:5001
```

### Manual build and deploy

```cmd
cd spareai
mvn clean package
copy /Y target\spareai.war C:\apache-tomcat-10.1.44\webapps\
rmdir /S /Q C:\apache-tomcat-10.1.44\webapps\spareai
cd /d C:\apache-tomcat-10.1.44\bin
startup.bat
```

After a successful build, the WAR file is at `spareai\target\spareai.war`.

## Open the application

Use these URLs after both services are running:

| Service | URL |
|---|---|
| Dashboard | `http://localhost:8080/spareai/ui/dashboard.jsp` |
| API base | `http://localhost:8080/spareai/api` |
| Stock parameters API | `http://localhost:8080/spareai/api/parameters/list` |
| Flask health | `http://localhost:5001/health` |

Example API checks:

```cmd
curl http://localhost:8080/spareai/api/inventory/list
curl http://localhost:8080/spareai/api/parameters/list
curl http://localhost:8080/spareai/api/charts/stock-levels
```

## Recommended startup order

1. Apply `db/schema.sql` and (if needed) `db/add-material-parameters.sql`.
2. Run `spareai\startup.bat` **or** start MySQL, Flask, Maven build, deploy WAR, and Tomcat manually.
3. Open the dashboard and hard-refresh after deploy (`Ctrl+Shift+R`).
4. Use **Stock Parameters** in the sidebar to edit per-material thresholds or apply preset defaults.

## Stop the servers

Flask window:

```cmd
Ctrl+C
```

Tomcat:

```cmd
cd /d C:\apache-tomcat-10.1.44\bin
shutdown.bat
```

## Repository layout

```text
BSP/
├── README.md
├── SpareAI_PRD.md
├── prophet training data/
└── spareai/
    ├── pom.xml
    ├── startup.bat / redeploy.bat
    ├── db/
    │   ├── schema.sql
    │   └── add-material-parameters.sql
    ├── spareai_real_data.sql
    ├── DOCUMENTATION.md
    ├── flask-service/
    └── src/main/
        ├── java/
        └── webapp/
```

## Troubleshooting

### Port 8080 is already in use

Another Tomcat instance or another application may already be using port 8080. Stop the other process or change Tomcat's HTTP port in `conf/server.xml`.

### Port 5001 is already in use

Stop the other Python process or change the port in `spareai/flask-service/app.py` and set `SPAREAI_FLASK_URL` to the same URL.

### Database connection errors

Confirm MySQL is running, the `spareai` database exists, and `SPAREAI_DB_USER` / `SPAREAI_DB_PASSWORD` are set in the same Command Prompt session that starts Tomcat.

### Forecast requests fail

Check `http://localhost:5001/health` first. If Flask is not running, the Java API cannot generate forecasts.

### Stock Parameters page missing or API errors

Run `db/add-material-parameters.sql`, then `redeploy.bat` or `startup.bat`, and hard-refresh the browser. If Tomcat still serves an old WAR, delete `webapps\spareai` before copying the new `spareai.war`.

### Dashboard changes not visible after git pull

Rebuild and redeploy the WAR (`redeploy.bat`). The UI is packaged inside `spareai.war`, not served from source folders directly.

### Prophet install fails on Windows

Use Python 3.11, upgrade `pip`, and install dependencies from an activated virtual environment. If compilation fails, install [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) and run `pip install -r requirements.txt` again.

## Additional documentation

- **Full technical reference:** `spareai/DOCUMENTATION.md` (APIs, schema, UI pages, parameters)
- Product requirements: `SpareAI_PRD.md`
- Prophet training data notes: `prophet training data/PROPHET_24M_README.md`
- Backend quick reference: `spareai/README.md`
