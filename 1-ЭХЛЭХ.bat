@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ═══════════════════════════════════════════════
echo   АЖИЛ ЭХЛЭХ — нөгөө компьютерын өөрчлөлтийг татна
echo ═══════════════════════════════════════════════
echo.

git rev-parse --git-dir >nul 2>&1
if errorlevel 1 (
  echo [АЛДАА] Энэ хавтас git repo биш байна.
  pause
  exit /b 1
)

rem — Хадгалаагүй өөрчлөлт байна уу
for /f %%i in ('git status --porcelain 2^>nul ^| find /c /v ""') do set N=%%i
if not "%N%"=="0" (
  echo [АНХААР] Танд илгээгээгүй %N% өөрчлөлт байна:
  echo.
  git status --short
  echo.
  echo   Эхлээд "2-ИЛГЭЭХ.bat" ажиллуулж хадгална уу.
  echo   Эсвэл эдгээрийг ХАЯХ бол доор Y бичнэ үү.
  echo.
  set /p ANS="Өөрчлөлтийг ХАЯХ уу? (Y = хаяна / Enter = болих): "
  if /i not "%ANS%"=="Y" (
    echo Болилоо. Юу ч өөрчлөгдөөгүй.
    pause
    exit /b 0
  )
  git reset --hard
)

echo Татаж байна...
git pull --rebase origin main
if errorlevel 1 (
  echo.
  echo [АЛДАА] Татаж чадсангүй. Интернэт холболтоо шалгана уу.
  pause
  exit /b 1
)

echo.
echo ✔ БЭЛЭН. Хамгийн сүүлийн хувилбар татагдлаа:
git log --oneline -3
echo.
echo   Файлууд:  kpi\script.js  kpi\index.html  kpi\style.css
echo   Дуусаад "2-ИЛГЭЭХ.bat" дарна уу.
echo.
pause
