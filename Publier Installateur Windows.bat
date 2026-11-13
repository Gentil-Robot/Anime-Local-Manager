@echo off
chcp 65001 >nul
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
title Anime Local Manager V2.1.1 Bêta stable - Installateur Windows
echo.
echo === Anime Local Manager V2.1.1 Bêta stable ===
echo Publication Windows : installateur NSIS
echo Node.js 22.12 minimum. Versions conseillees dans .node-version.
where node >nul 2>nul
if errorlevel 1 goto :node_missing
node scripts\release-windows.js --resume
if errorlevel 1 goto :error
if exist dist start "" "dist"
pause
exit /b 0
:node_missing
echo Node.js est introuvable. Installer la version indiquee dans .node-version.
pause
exit /b 1
:error
echo Publication arretee. Les details sont dans logs.
echo Relancer REPRENDRE_BUILD_WINDOWS.bat apres correction.
pause
exit /b 1
