@echo off
title RugRadar
cd /d "%~dp0"
echo ================================
echo   RugRadar baslatiliyor...
echo   Kapatmak icin bu pencereyi kapat.
echo ================================
echo.

REM Ilk calistirmada bagimliliklar yoksa kur
if not exist "node_modules" (
  echo [kurulum] node_modules yok, npm install...
  call npm install
  call npx prisma generate
  call npx prisma migrate deploy
)

call npm run start:local

echo.
echo RugRadar durdu. Cikmak icin bir tusa bas...
pause >nul
