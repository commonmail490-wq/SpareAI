@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

if exist "%~dp0set-local.bat" call "%~dp0set-local.bat"
if not defined CATALINA_HOME set "CATALINA_HOME=D:\tomcat\apache-tomcat-10.1.54"
if not exist "%CATALINA_HOME%\bin\startup.bat" call :ResolveCatalinaHome

echo.
echo ========================================
echo   SpareAI — startup
echo ========================================
echo.

rem --- 1. MySQL ---
echo [1/5] Starting MySQL...
net start MySQL80
if errorlevel 1 (
  sc query MySQL80 2>nul | findstr /i "RUNNING" >nul
  if errorlevel 1 (
    echo ERROR: Could not start MySQL80. Run as Administrator if needed.
    exit /b 1
  )
  echo       MySQL80 is already running.
) else (
  echo       MySQL80 started.
)

rem --- 2. Maven build ---
echo.
echo [2/5] Building spareai.war (Maven, skip tests)...
call mvn package -DskipTests
if errorlevel 1 (
  echo ERROR: Maven build failed.
  exit /b 1
)

rem --- 3. Deploy WAR to Tomcat ---
echo.
echo [3/5] Deploying latest WAR to Tomcat...
if not exist "target\spareai.war" (
  echo ERROR: target\spareai.war not found after build.
  exit /b 1
)
if not defined CATALINA_HOME (
  echo WARN: CATALINA_HOME is not set. Skipping deploy.
  echo       Set CATALINA_HOME in set-local.bat or run redeploy.bat manually.
  goto :StartTomcat
)
if not exist "%CATALINA_HOME%\webapps" (
  echo WARN: Tomcat webapps folder not found: %CATALINA_HOME%\webapps
  echo       Skipping deploy.
  goto :StartTomcat
)
echo       Target: %CATALINA_HOME%\webapps\
if exist "%CATALINA_HOME%\webapps\spareai" (
  echo       Removing old exploded app...
  rmdir /S /Q "%CATALINA_HOME%\webapps\spareai"
)
copy /Y "target\spareai.war" "%CATALINA_HOME%\webapps\"
if errorlevel 1 (
  echo ERROR: Failed to copy spareai.war to Tomcat webapps.
  exit /b 1
)
echo       Deployed target\spareai.war

:StartTomcat
rem --- 4. Tomcat ---
echo.
echo [4/5] Starting Tomcat...
if not defined CATALINA_HOME (
  echo ERROR: CATALINA_HOME is not set. Cannot start Tomcat.
  exit /b 1
)
if not exist "%CATALINA_HOME%\bin\startup.bat" (
  echo ERROR: Tomcat not found at %CATALINA_HOME%
  exit /b 1
)
call "%CATALINA_HOME%\bin\startup.bat"
if errorlevel 1 (
  echo ERROR: Tomcat startup failed.
  exit /b 1
)
echo       Tomcat started. Open http://localhost:8080/spareai/ui/dashboard.jsp
echo       Hard-refresh the browser after deploy (Ctrl+Shift+R).

rem --- 5. Flask ---
echo.
echo [5/5] Starting Flask...
call C:\spareai-venv\Scripts\activate.bat
cd /d "D:\Projects\BSP\spareai\flask-service"
python app.py

endlocal
exit /b 0

:ResolveCatalinaHome
if defined CATALINA_HOME if exist "%CATALINA_HOME%\bin\startup.bat" exit /b 0
for %%T in (
  "D:\tomcat\apache-tomcat-10.1.54"
  "D:\tomcat\apache-tomcat-10.1.44"
  "C:\apache-tomcat-10.1.44"
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
exit /b 0
