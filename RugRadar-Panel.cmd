@echo off
title RugRadar Panel
cd /d "%~dp0"
echo ============================================
echo   RugRadar + Web Panel baslatiliyor
echo   Panel: http://localhost:5173
echo   Kapatmak icin iki pencereyi de kapat.
echo ============================================
echo.

REM worker bagimliliklari
if not exist "node_modules" (
  echo [kurulum] worker: npm install...
  call npm install
  call npx prisma generate
  call npx prisma migrate deploy
)
REM client bagimliliklari
if not exist "client\node_modules" (
  echo [kurulum] client: npm install...
  pushd client
  call npm install
  popd
)

REM worker'i ayri pencerede baslat (API :3000 + Telegram bot)
start "RugRadar Worker" cmd /k "cd /d %~dp0 && npm run start:local"

REM birkac saniye ver, sonra paneli baslat (bu pencerede)
timeout /t 3 >nul
echo Panel aciliyor... tarayicida http://localhost:5173
cd /d "%~dp0client"
call npm run dev

echo.
echo Panel durdu. Cikmak icin bir tusa bas...
pause >nul
