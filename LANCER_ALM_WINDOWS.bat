@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Anime Local Manager V2.0.0 Bêta stable
where node >nul 2>nul
if errorlevel 1 goto node_missing
node -e "if(Number(process.versions.node.split('.')[0])<22){console.error('Node.js 22 ou plus recent est requis.');process.exit(1)}"
if errorlevel 1 goto fail
if exist "node_modules\electron\dist\electron.exe" goto launch
echo Installation des dependances...
call npm install --no-audit --no-fund
if errorlevel 1 goto fail
:launch
echo Ouverture avec le profil habituel. Une sauvegarde JSON est recommandee.
call npm run app
if errorlevel 1 goto fail
exit /b 0
:node_missing
echo Node.js est absent. Installe Node.js 22 ou plus recent, puis relance.
goto fail
:fail
echo.
echo ALM n'a pas pu demarrer. Le journal ci-dessus donne la cause.
echo Aucune sauvegarde utilisateur n'a ete supprimee.
pause
exit /b 1
