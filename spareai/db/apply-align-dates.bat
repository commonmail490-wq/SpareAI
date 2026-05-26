@echo off
setlocal
cd /d "%~dp0"
echo Applying consumption date alignment to spareai database...
mysql -u root -p spareai < align-consumption-dates.sql
if errorlevel 1 (
  echo Failed. Ensure MySQL is running and credentials are correct.
  exit /b 1
)
echo Done.
endlocal
