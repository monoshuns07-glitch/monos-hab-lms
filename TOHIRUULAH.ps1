# Монос ХАБЭА — нөгөө компьютерт тохируулах
# Ажиллуулах:  powershell -ExecutionPolicy Bypass -File TOHIRUULAH.ps1
$ErrorActionPreference = "Stop"
$repo = $PSScriptRoot
if (-not $repo) { $repo = (Get-Location).Path }

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "   МОНОС ХАБЭА - ТОХИРУУЛГА" -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "   Хавтас: $repo"
Write-Host ""

# --- 1. Мөрийн төгсгөл (ХАМГИЙН ЧУХАЛ) ---
Write-Host "  [1/4] Мөрийн төгсгөлийг тохируулж байна..." -ForegroundColor Yellow
Push-Location $repo
git config core.autocrlf false
git config core.eol lf
git config core.quotepath false
Write-Host "        OK - script.js зөрчилдөхөө болино"

# --- 2. Node шалгах ---
Write-Host ""
Write-Host "  [2/4] Node.js шалгаж байна..." -ForegroundColor Yellow
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
  Write-Host ("        OK - " + (& node -v))
} else {
  Write-Host "        ! Node.js СУУГААГҮЙ байна." -ForegroundColor Red
  Write-Host "        Локал хөгжүүлэлт ажиллахгүй. https://nodejs.org -оос татна уу."
  Write-Host "        (Git-ээр татах/илгээх нь Node-гүй ч ажиллана)"
}

# --- 3. Desktop товчлуурууд ---
Write-Host ""
Write-Host "  [3/4] Desktop дээр товчлуур тавьж байна..." -ForegroundColor Yellow
$desk = $null
foreach ($c in @(
    (Join-Path $env:USERPROFILE "OneDrive - monos\Desktop"),
    (Join-Path $env:USERPROFILE "OneDrive\Desktop"),
    [Environment]::GetFolderPath("Desktop"),
    (Join-Path $env:USERPROFILE "Desktop"))) {
  if ($c -and (Test-Path -LiteralPath $c)) { $desk = $c; break }
}
if ($desk) {
  $enc = New-Object System.Text.UTF8Encoding $false
  $head = @("@echo off", "chcp 65001 >nul", ("cd /d `"$repo`""))
  $mk = {
    param($name, $tail)
    $path = Join-Path $desk $name
    [System.IO.File]::WriteAllLines($path, ($head + $tail), $enc)
    Write-Host ("        OK - " + $name)
  }
  & $mk ([char]0x0425+[char]0x0410+[char]0x0411+[char]0x042D+[char]0x0410+" 1 - "+[char]0x0422+[char]0x0410+[char]0x0422+[char]0x0410+[char]0x0425+".bat") @("call `"1-ЭХЛЭХ.bat`"")
  & $mk ([char]0x0425+[char]0x0410+[char]0x0411+[char]0x042D+[char]0x0410+" 2 - "+[char]0x0425+[char]0x04E8+[char]0x0413+[char]0x0416+[char]0x04AE+[char]0x04AE+[char]0x041B+[char]0x042D+[char]0x0425+".bat") @("call `"ХӨГЖҮҮЛЭХ.bat`"")
  & $mk ([char]0x0425+[char]0x0410+[char]0x0411+[char]0x042D+[char]0x0410+" 3 - "+[char]0x0418+[char]0x041B+[char]0x0413+[char]0x042D+[char]0x042D+[char]0x0425+".bat") @("call `"2-ИЛГЭЭХ.bat`"")
  [System.IO.File]::WriteAllLines(
    (Join-Path $desk ([char]0x0425+[char]0x0410+[char]0x0411+[char]0x042D+[char]0x0410+" - "+[char]0x0425+[char]0x0410+[char]0x0412+[char]0x0422+[char]0x0410+[char]0x0421+".bat")),
    @("@echo off", ("start `"`" explorer.exe `"$repo`"")), $enc)
  Write-Host ("        Desktop: " + $desk)
} else {
  Write-Host "        ! Desktop олдсонгүй - товчлуургүй үргэлжилнэ" -ForegroundColor Red
}

# --- 4. Хамгийн сүүлийн хувилбар ---
Write-Host ""
Write-Host "  [4/4] Хамгийн сүүлийн хувилбарыг татаж байна..." -ForegroundColor Yellow
try { git pull --rebase origin main 2>&1 | Out-Null; Write-Host "        OK" }
catch { Write-Host "        (алгасав)" }
Pop-Location

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Green
Write-Host "   БЭЛЭН БОЛЛОО" -ForegroundColor Green
Write-Host "  ============================================" -ForegroundColor Green
Write-Host ""
Write-Host "   Desktop дээр 4 товчлуур гарсан:"
Write-Host "     ХАБЭА 1 - ТАТАХ        нөгөө комын ажлыг авна"
Write-Host "     ХАБЭА 2 - ХӨГЖҮҮЛЭХ    локал сервер + браузер"
Write-Host "     ХАБЭА 3 - ИЛГЭЭХ       сайт руу гаргана"
Write-Host "     ХАБЭА - ХАВТАС         кодын хавтас"
Write-Host ""
Write-Host "   Анх удаа ИЛГЭЭХ дарахад браузер нээгдэж" -ForegroundColor Yellow
Write-Host "   GitHub-д нэвтрэхийг хүснэ. Нэг л удаа." -ForegroundColor Yellow
Write-Host "   Токен хуулах ШААРДЛАГАГҮЙ." -ForegroundColor Yellow
Write-Host ""
Read-Host "   Enter дарж хаана уу"
