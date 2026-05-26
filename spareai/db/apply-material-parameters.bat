@echo off
REM Applies add-material-parameters.sql to local MySQL (adjust credentials as needed)
setlocal
cd /d "%~dp0"

if not defined SPAREAI_DB_USER set SPAREAI_DB_USER=root
if not defined SPAREAI_DB_PASSWORD set SPAREAI_DB_PASSWORD=
if not defined SPAREAI_DB_HOST set SPAREAI_DB_HOST=127.0.0.1

echo Applying material parameter columns to spareai...
mysql -h %SPAREAI_DB_HOST% -u %SPAREAI_DB_USER% %SPAREAI_DB_PASSWORD:=-p% spareai < add-material-parameters.sql
if errorlevel 1 (
  echo Migration failed. Check MySQL is running and credentials are correct.
  exit /b 1
)
echo Done.
endlocal
