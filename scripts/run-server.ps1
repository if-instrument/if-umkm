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

Write-Host "Menjalankan IF Instrument UMKM Solution"
Write-Host "URL lokal : http://127.0.0.1:$Port"
Write-Host "Bind     : ${HostName}:${Port}"
Write-Host ""

& $PhpBin spark serve --host $HostName --port $Port
