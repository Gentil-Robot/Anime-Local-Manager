@echo off
cd /d "%~dp0"
title Anime Local Manager

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js n'est pas installe.
  echo Installe Node.js LTS ici : https://nodejs.org/
  pause
  exit /b
)

if not exist "node_modules" (
  echo Premiere installation des dependances...
  call npm install
  if errorlevel 1 (
    echo Erreur pendant npm install.
    pause
    exit /b
  )
) else (
  echo Dependances deja installees, npm install ignore.
)

echo Toutes les donnees restent dans ce dossier projet.
echo Tu peux configurer un backup cloud dans Reglages.
echo.
echo Lancement du serveur...
start "" http://localhost:3123
call npm start
pause
