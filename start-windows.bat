@echo off
setlocal
cd /d "%~dp0"
where npm >nul 2>nul || (
  echo Chua tim thay Node.js. Hay cai Node.js LTS truoc.
  pause
  exit /b 1
)
where cargo >nul 2>nul || (
  echo Chua tim thay Rust. Hay cai Rust va WebView2 truoc.
  pause
  exit /b 1
)
if not exist node_modules call npm install
call npm run tauri dev
if errorlevel 1 pause
