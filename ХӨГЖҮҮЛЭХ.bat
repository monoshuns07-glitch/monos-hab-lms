@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Монос ХАБЭА — локал хөгжүүлэлт

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo  [АЛДАА] Node.js суугаагүй байна.
  echo  https://nodejs.org  татаад суулгаад дахин оролдоно уу.
  echo.
  pause
  exit /b 1
)

echo.
echo  Эхлүүлж байна... браузер өөрөө нээгдэнэ.
echo.
node dev-server.js
echo.
echo  Сервер зогслоо.
pause
