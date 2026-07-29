@echo off
title TurboSpace
cd /d "%~dp0"

net session >nul 2>&1
if %errorLevel% NEQ 0 (
    echo Solicitando permissao de Administrador...
    powershell -Command "Start-Process '%~dpnx0' -Verb RunAs"
    exit /b
)

if not exist "node_modules\electron\dist\electron.exe" (
    echo.
    echo ERRO: dependencias nao instaladas.
    echo Rode "npm install" nesta pasta e tente novamente.
    echo.
    pause
    exit /b 1
)

echo Abrindo TurboSpace...
start "" /b "node_modules\electron\dist\electron.exe" "%~dp0."
exit /b 0
