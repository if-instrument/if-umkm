param(
    [string]$HostName = "0.0.0.0",
    [int]$Port = 8000
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$AiDir = Join-Path $RootDir "ai-service"

Set-Location $AiDir

if (!(Test-Path "venv")) {
    Write-Host "Membuat Virtual Environment di ai-service/venv..."
    & python -m venv venv
}

$pythonExec = Join-Path $AiDir "venv\Scripts\python.exe"
$pipExec = Join-Path $AiDir "venv\Scripts\pip.exe"

if (!(Test-Path $pythonExec)) {
    $pythonExec = "python"
    $pipExec = "pip"
}

try {
    & $pythonExec -c "import pymysql, fastapi, uvicorn" 2>$null
} catch {
    Write-Host "Menginstall dependensi AI Microservice (pymysql, fastapi)..."
    & $pipExec install -r requirements.txt --quiet
}

Write-Host "=================================================="
Write-Host "Menjalankan POS AI Microservice (Python)"
Write-Host "Host: $HostName"
Write-Host "Port: $Port"
Write-Host "URL : http://${HostName}:${Port}"
Write-Host "=================================================="

& $pythonExec -m app.main
