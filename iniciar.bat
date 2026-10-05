@echo off
rem Sobe o site com Docker e abre no navegador. Windows: dois cliques neste arquivo.
chcp 65001 >nul
cd /d "%~dp0"

where docker >nul 2>&1
if errorlevel 1 (
  echo O Docker nao esta instalado. Instale o Docker Desktop em https://www.docker.com/products/docker-desktop/ e tente de novo.
  pause
  exit /b 1
)
docker info >nul 2>&1
if errorlevel 1 (
  echo O Docker esta instalado mas nao respondeu. Abra o Docker Desktop e espere ele terminar de iniciar.
  pause
  exit /b 1
)

set PORTA=3000
if exist .env for /f "usebackq tokens=1,* delims==" %%a in (".env") do if /i "%%a"=="PORTA" set PORTA=%%b

echo Preparando o site. A primeira vez leva alguns minutos ^(monta a imagem, baixa as cartas e um mes de torneios^).
docker compose up -d --build
if errorlevel 1 (
  echo O Docker nao conseguiu subir o site. A mensagem de erro esta logo acima.
  pause
  exit /b 1
)

echo Esperando o site responder...
:esperar
docker compose exec -T site node -e "fetch('http://127.0.0.1:3000/api/colecao').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >nul 2>&1
if not errorlevel 1 goto pronto
docker compose ps -q --status running site | findstr . >nul
if errorlevel 1 (
  echo O site parou de rodar. Veja o motivo com:  docker compose logs site
  pause
  exit /b 1
)
timeout /t 5 /nobreak >nul
goto esperar

:pronto
echo.
echo No ar em http://localhost:%PORTA%
echo Em outro aparelho da mesma rede ^(celular, tablet^), use o IP deste computador no lugar de "localhost".
echo Para parar: parar.bat
start "" "http://localhost:%PORTA%"
pause
