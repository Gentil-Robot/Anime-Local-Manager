@echo off
cd /d "%~dp0"
title Creation EXE Anime Local Manager

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js n'est pas installe.
  echo Installe Node.js LTS ici : https://nodejs.org/
  pause
  exit /b
)

if not exist "node_modules" (
  echo Installation des dependances...
  call npm install
  if errorlevel 1 pause & exit /b
)

echo Creation du .exe portable...
call npm run build
echo.
echo Termine. Regarde dans le dossier dist.
pause
