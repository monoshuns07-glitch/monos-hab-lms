@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ═══════════════════════════════════════════════
echo   ИЛГЭЭХ — өөрчлөлтийг сайт руу гаргана
echo ═══════════════════════════════════════════════
echo.

git rev-parse --git-dir >nul 2>&1
if errorlevel 1 (
  echo [АЛДАА] Энэ хавтас git repo биш байна.
  pause
  exit /b 1
)

for /f %%i in ('git status --porcelain 2^>nul ^| find /c /v ""') do set N=%%i
if "%N%"=="0" (
  echo Өөрчлөлт алга — илгээх зүйл байхгүй.
  echo.
  pause
  exit /b 0
)

echo Өөрчлөгдсөн файлууд:
git status --short
echo.

rem — Кэш дугаарыг санууль
findstr /C:"script.js?v=" kpi\index.html
echo.
echo   ^(script.js засварласан бол дээрх v= дугаарыг 1-ээр нэмэгдүүлсэн байх ёстой^)
echo.

set /p MSG="Юу өөрчилсөн бэ (богино бич): "
if "%MSG%"=="" set MSG=шинэчлэл

echo.
echo Эхлээд нөгөө компьютерын өөрчлөлтийг татаж байна...
git stash push -u -m "auto" >nul 2>&1
git pull --rebase origin main
if errorlevel 1 (
  git stash pop >nul 2>&1
  echo.
  echo [АЛДАА] Татаж чадсангүй. Интернэт холболтоо шалгана уу.
  pause
  exit /b 1
)
git stash pop >nul 2>&1
if errorlevel 1 (
  echo.
  echo ══════════════════════════════════════════════════════
  echo  [ЗӨРЧИЛ] Нөгөө компьютер дээр ИЖИЛ файлыг өөрчилсөн байна.
  echo  Файл дотор ^<^<^<^<^<^<^< гэсэн тэмдэг гарсан байгаа.
  echo  Клауд-д хандаж "git зөрчил гарлаа" гэж хэлээрэй.
  echo ══════════════════════════════════════════════════════
  pause
  exit /b 1
)

git add -A
git commit -m "%MSG%"
if errorlevel 1 (
  echo Commit хийх зүйл алга.
  pause
  exit /b 0
)

echo.
echo Илгээж байна...
git push origin main
if errorlevel 1 (
  echo.
  echo [АЛДАА] Илгээж чадсангүй. Дахин оролдоно уу.
  pause
  exit /b 1
)

echo.
echo ✔ ИЛГЭЭГДЛЭЭ.
echo.
echo   Сайт 1-2 минутын дараа шинэчлэгдэнэ:
echo   https://monos-hab.vercel.app/kpi/
echo.
echo   Явцыг эндээс харна:
echo   https://github.com/monoshuns07-glitch/monos-hab-lms/actions
echo.
pause
