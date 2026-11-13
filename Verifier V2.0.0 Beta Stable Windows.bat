@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"
title Anime Local Manager V2.1.0 Bêta stable - Verification avant publication
echo === V2.1.0 Bêta stable : verifications dans le dossier du projet ===
where node >nul 2>nul
if errorlevel 1 goto :error
echo Versions du poste :
node --version
call npm --version
if errorlevel 1 goto :error
call npm ci --no-fund
if errorlevel 1 goto :error
call npm list electron
if errorlevel 1 goto :error
call npx --no-install electron --version
if errorlevel 1 goto :error
call npm audit --omit=dev
if errorlevel 1 goto :error
call npm audit --audit-level=high
if errorlevel 1 goto :error
call npm run release:check
if errorlevel 1 goto :error
call npm run verify
if errorlevel 1 goto :error
echo Toutes les verifications locales lancees ont reussi.
echo Pour produire et tester le .exe, lancer Publier Installateur Windows.bat.
pause
exit /b 0
:error
echo Verification interrompue : corriger l'erreur affichee avant publication.
pause
exit /b 1
