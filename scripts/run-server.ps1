param(
    [string]$PhpBin = "",
    [string]$HostName = "0.0.0.0",
    [int]$Port = 8081
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $RootDir

function Resolve-PhpBin {
    param([string]$Candidate)
    if ($Candidate) { return $Candidate }
    $php83 = Get-Command php83 -ErrorAction SilentlyContinue
    if ($php83) { return "php83" }
    $php = Get-Command php -ErrorAction SilentlyContinue
    if ($php) { return "php" }
    throw "PHP tidak ditemukan. Install PHP 8.2+ atau isi -PhpBin."
}

$PhpBin = Resolve-PhpBin $PhpBin

$aiJob = $null
if (Test-Path "scripts\run-ai-service.ps1") {
    Write-Host "Menjalankan AI Microservice (Python) di background..."
    $aiJob = Start-Job -ScriptBlock { param($dir); Set-Location $dir; .\scripts\run-ai-service.ps1 } -ArgumentList $RootDir
    Start-Sleep -Seconds 1
}

try {
    Write-Host "=================================================="
    Write-Host "Menjalankan IF Instrument UMKM Solution"
    Write-Host "URL Aplikasi POS : http://127.0.0.1:$Port"
    Write-Host "URL AI Microservice: http://127.0.0.1:8000"
    Write-Host "Bind            : ${HostName}:${Port}"
    Write-Host "=================================================="
    Write-Host ""

    & $PhpBin spark serve --host $HostName --port $Port
} finally {
    if ($aiJob) {
        Write-Host "Menghentikan AI Microservice background job..."
        Stop-Job $aiJob -ErrorAction SilentlyContinue
        Remove-Job $aiJob -ErrorAction SilentlyContinue
    }
}
