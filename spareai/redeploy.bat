@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

if exist "%~dp0set-local.bat" call "%~dp0set-local.bat"
if not defined CATALINA_HOME call :ResolveCatalinaHome

echo Building spareai.war...
call mvn -q package -DskipTests
if errorlevel 1 (
  echo Build failed.
  exit /b 1
)

if not defined CATALINA_HOME (
  echo.
  echo WAR built: %cd%\target\spareai.war
  echo.
  echo CATALINA_HOME is not set. Copy the WAR manually, for example:
  echo   copy /Y target\spareai.war D:\tomcat\apache-tomcat-10.1.54\webapps\
  echo Then delete the exploded folder if it exists:
  echo   rmdir /S /Q D:\tomcat\apache-tomcat-10.1.54\webapps\spareai
  echo Restart Tomcat and open http://localhost:8080/spareai/ui/dashboard.jsp
  exit /b 0
)

echo Deploying to %CATALINA_HOME%\webapps\
if exist "%CATALINA_HOME%\webapps\spareai" rmdir /S /Q "%CATALINA_HOME%\webapps\spareai"
copy /Y "target\spareai.war" "%CATALINA_HOME%\webapps\"
echo Done. Wait for Tomcat to redeploy, then hard-refresh the browser (Ctrl+Shift+R).
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
