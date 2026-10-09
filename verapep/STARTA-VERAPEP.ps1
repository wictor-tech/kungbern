$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js 22 eller senare saknas." -ForegroundColor Yellow
    Write-Host "Installera med: winget install OpenJS.NodeJS.LTS"
    Read-Host "Tryck Enter för att stänga"
    exit 1
}

Write-Host "Startar VERAPEP v12.4..." -ForegroundColor Cyan
$server = Start-Process powershell.exe -PassThru -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location -LiteralPath '$PSScriptRoot'; npm start"
)

Start-Sleep -Seconds 3
Start-Process "http://localhost:3000"
Write-Host "Webbshop: http://localhost:3000" -ForegroundColor Green
Write-Host "Admin:   http://localhost:3000/admin.html" -ForegroundColor Green
