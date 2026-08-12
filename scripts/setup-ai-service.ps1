$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$AiDir = Join-Path $RootDir "ai-service"

Write-Host "== POS AI Microservice Setup =="
Write-Host "Directory: $AiDir"

if (!(Test-Path $AiDir)) {
    throw "Error: Directory ai-service tidak ditemukan!"
}

Set-Location $AiDir

# 1. Detect Python
$pythonBin = Get-Command python -ErrorAction SilentlyContinue
if (!$pythonBin) {
    throw "Error: Python 3 tidak ditemukan. Silakan install Python 3.10+ terlebih dahulu."
}

Write-Host "Menggunakan Python: $(& python --version)"

# 2. Copy .env.example if .env does not exist
if (!(Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Host "Membuat ai-service/.env dari ai-service/.env.example"
    }
}

# 3. Create Python Virtual Environment
if (!(Test-Path "venv")) {
    Write-Host "Membuat Virtual Environment di ai-service/venv..."
    & python -m venv venv
}

# 4. Install dependencies
$venvPip = Join-Path $AiDir "venv\Scripts\pip.exe"
if (Test-Path $venvPip) {
    Write-Host "Menginstall / mengupdate dependensi AI Microservice..."
    & $venvPip install --upgrade pip setuptools wheel --quiet
    if (Test-Path "requirements.txt") {
        & $venvPip install -r requirements.txt
    }
}

Write-Host ""
Write-Host "✓ AI Microservice Setup Selesai!"
Write-Host "Untuk menjalankan AI Microservice:"
Write-Host "  .\scripts\run-ai-service.ps1"
