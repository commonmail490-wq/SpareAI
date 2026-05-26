@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

rem ---------------------------------------------------------------------------
rem SpareAI — start MySQL, build/deploy WAR, Tomcat, and Flask (Prophet)
rem Run as Administrator if "net start MySQL80" fails.
rem Copy set-local.bat.example to set-local.bat to set CATALINA_HOME / VENV_DIR.
rem ---------------------------------------------------------------------------

set "MYSQL_SERVICE=MySQL80"
set "DASHBOARD_URL=http://localhost:8080/spareai/ui/dashboard.jsp"
set "FLASK_URL=http://localhost:5001/health"
set "VENV_ACTIVATE="

if exist "%~dp0set-local.bat" call "%~dp0set-local.bat"

echo.
echo ========================================
echo   SpareAI — Starting full stack
echo ========================================
echo.

rem --- 1. MySQL ---
echo [1/6] Starting MySQL service (%MYSQL_SERVICE%)...
net start %MYSQL_SERVICE% >nul 2>&1
if errorlevel 1 (
  sc query %MYSQL_SERVICE% 2>nul | findstr /i "RUNNING" >nul
  if errorlevel 1 (
    echo.
    echo ERROR: Could not start %MYSQL_SERVICE%.
    echo        - Run this batch file as Administrator, or
    echo        - Start the service manually: net start %MYSQL_SERVICE%
    exit /b 1
  )
  echo       Already running.
) else (
  echo       Started.
)
timeout /t 2 /nobreak >nul

rem --- 2. Python venv (before Tomcat / Flask) ---
echo.
echo [2/6] Activating Python virtual environment...
call :ActivateVenv
if errorlevel 1 (
  echo.
  echo WARNING: No venv found. Flask will use system Python.
  echo          Create one:  cd flask-service ^&^& python -m venv venv
  echo          Then:        pip install -r requirements.txt
)

rem --- 3. Maven build ---
echo.
echo [3/6] Building spareai.war (Maven)...
call mvn -q package -DskipTests
if errorlevel 1 (
  echo.
  echo ERROR: Maven build failed.
  exit /b 1
)
if not exist "target\spareai.war" (
  echo.
  echo ERROR: target\spareai.war was not created.
  exit /b 1
)
echo       Build OK: %cd%\target\spareai.war

rem --- 4. Resolve Tomcat + deploy WAR ---
echo.
echo [4/6] Deploying WAR to Tomcat...
call :ResolveCatalinaHome
if errorlevel 1 (
  echo.
  echo ERROR: Tomcat 10 not found.
  echo        Copy set-local.bat.example to set-local.bat and set CATALINA_HOME, e.g.:
  echo          set "CATALINA_HOME=D:\tomcat\apache-tomcat-10.1.54"
  exit /b 1
)
echo       Using CATALINA_HOME=%CATALINA_HOME%
if exist "%CATALINA_HOME%\webapps\spareai" (
  echo       Removing exploded webapp folder...
  rmdir /S /Q "%CATALINA_HOME%\webapps\spareai"
)
copy /Y "target\spareai.war" "%CATALINA_HOME%\webapps\" >nul
if errorlevel 1 (
  echo.
  echo ERROR: Failed to copy WAR to %CATALINA_HOME%\webapps\
  exit /b 1
)
echo       Deployed to %CATALINA_HOME%\webapps\

rem --- 5. Tomcat ---
echo.
echo [5/6] Starting Apache Tomcat...
netstat -ano 2>nul | findstr /C:":8080 " | findstr LISTENING >nul 2>&1
if not errorlevel 1 (
  echo       Port 8080 is already in use — Tomcat may already be running.
  echo       WAR was copied; wait for redeploy or restart Tomcat manually.
) else (
  if defined VENV_ACTIVATE (
    start "SpareAI — Tomcat" /D "%CATALINA_HOME%\bin" cmd /k "call \"%VENV_ACTIVATE%\" && call startup.bat"
  ) else (
    start "SpareAI — Tomcat" /D "%CATALINA_HOME%\bin" cmd /k call startup.bat
  )
  echo       Tomcat starting in a new window...
)

rem --- 6. Flask ---
echo.
echo [6/6] Starting Flask Prophet service (python app.py)...
if not exist "flask-service\app.py" (
  echo.
  echo ERROR: flask-service\app.py not found.
  exit /b 1
)
where python >nul 2>&1
if errorlevel 1 (
  echo.
  echo ERROR: python is not on PATH. Activate venv or install Python.
  exit /b 1
)
netstat -ano 2>nul | findstr /C:":5001 " | findstr LISTENING >nul 2>&1
if not errorlevel 1 (
  echo       Port 5001 is already in use — Flask may already be running.
) else (
  if defined VENV_ACTIVATE (
    start "SpareAI — Flask" /D "%~dp0flask-service" cmd /k "call \"%VENV_ACTIVATE%\" && python app.py"
  ) else (
    start "SpareAI — Flask" /D "%~dp0flask-service" cmd /k python app.py
  )
  echo       Flask starting in a new window (port 5001)...
)

echo.
echo ========================================
echo   SpareAI stack startup complete
echo ========================================
echo.
echo   Tomcat:     %CATALINA_HOME%
echo   Dashboard:  %DASHBOARD_URL%
echo   Flask:      %FLASK_URL%
echo.
echo   Optional env (set in set-local.bat if needed):
echo     SPAREAI_DB_PASSWORD, SPAREAI_FLASK_URL
echo.
echo   Tomcat and Flask run in separate windows — leave them open.
echo   Press any key to close this launcher window...
pause >nul
endlocal
exit /b 0

rem ===========================================================================
:ActivateVenv
if defined VENV_DIR if exist "%VENV_DIR%\Scripts\activate.bat" (
  call "%VENV_DIR%\Scripts\activate.bat"
  set "VENV_ACTIVATE=%VENV_DIR%\Scripts\activate.bat"
  echo       Activated: %VENV_DIR%
  exit /b 0
)
for %%V in (
  "%~dp0flask-service\venv"
  "%~dp0venv"
  "%~dp0.flask-venv"
) do (
  if exist "%%~V\Scripts\activate.bat" (
    call "%%~V\Scripts\activate.bat"
    set "VENV_ACTIVATE=%%~V\Scripts\activate.bat"
    echo       Activated: %%~V
    exit /b 0
  )
)
exit /b 1

:ResolveCatalinaHome
if defined CATALINA_HOME if exist "%CATALINA_HOME%\bin\startup.bat" exit /b 0
for %%T in (
  "D:\tomcat\apache-tomcat-10.1.54"
  "D:\tomcat\apache-tomcat-10.1.44"
  "C:\apache-tomcat-10.1.44"
  "C:\apache-tomcat-10.1.54"
  "%USERPROFILE%\apache-tomcat-10.1.44"
) do (
  if exist "%%~T\bin\startup.bat" (
    set "CATALINA_HOME=%%~T"
    exit /b 0
  )
)
if exist "D:\tomcat\" (
  for /d %%T in ("D:\tomcat\apache-tomcat*") do (
    if exist "%%~T\bin\startup.bat" (
      set "CATALINA_HOME=%%~T"
      exit /b 0
    )
  )
)
if exist "C:\" (
  for /d %%T in ("C:\apache-tomcat*") do (
    if exist "%%~T\bin\startup.bat" (
      set "CATALINA_HOME=%%~T"
      exit /b 0
    )
  )
)
exit /b 1
