@echo off
cd /d "%~dp0"
title Anime Local Manager Beta

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

echo Lancement en mode application...
call npm run app
pause
