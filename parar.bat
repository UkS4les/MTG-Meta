@echo off
rem Para o site e o tracker. Os dados ficam guardados para a proxima vez.
chcp 65001 >nul
cd /d "%~dp0"
docker compose --profile tracker down
echo Parado. Os dados continuam guardados.
pause
