@echo off
rem Sobe o tracker do Arena com Docker. Na primeira vez pergunta a chave e guarda no arquivo .env.
chcp 65001 >nul
setlocal
cd /d "%~dp0"
if not exist .env type nul > .env

findstr /b /c:"MTGA_LOG_DIR=" .env >nul
if errorlevel 1 (
  if not exist "%USERPROFILE%\AppData\LocalLow\Wizards Of The Coast\MTGA" (
    echo Nao encontrei a pasta do log do Arena. Abra o jogo uma vez e tente de novo.
    pause
    exit /b 1
  )
  >>.env echo MTGA_LOG_DIR=%USERPROFILE%\AppData\LocalLow\Wizards Of The Coast\MTGA
)

findstr /b /c:"MTG_META_CHAVE=" .env >nul
if errorlevel 1 (
  set /p CHAVE=Cole a chave do tracker ^(site, pagina Conta, Gerar chave^): 
  call :guardar
)

docker compose --profile tracker up -d
if errorlevel 1 (
  echo O Docker nao conseguiu subir o tracker. Rode iniciar.bat antes, se ainda nao rodou.
  pause
  exit /b 1
)
echo Tracker no ar. Para ver o que ele esta fazendo:  docker compose logs -f tracker
pause
exit /b 0

:guardar
if "%CHAVE%"=="" (
  echo Sem a chave o tracker nao consegue enviar partidas.
  pause
  exit 1
)
>>.env echo MTG_META_CHAVE=%CHAVE%
exit /b 0
