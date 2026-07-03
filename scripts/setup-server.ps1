param(
    [switch]$Fresh,
    [switch]$SkipComposer,
    [switch]$SkipDbCreate,
    [switch]$SkipMigrate,
    [string]$PhpBin = "",
    [string]$ComposerBin = "composer",
    [string]$AppUrl = "http://localhost:8081/",
    [string]$DbHost = "localhost",
    [string]$DbName = "if_instrument_umkm",
    [string]$DbUser = "root",
    [string]$DbPass = "",
    [int]$DbPort = 3306,
    [string]$CiEnvironment = "production"
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

Write-Host "== IF Instrument UMKM Solution setup =="
Write-Host "Project     : $RootDir"
Write-Host "PHP         : $PhpBin"
Write-Host "Environment : $CiEnvironment"
Write-Host "App URL     : $AppUrl"
Write-Host "Database    : ${DbHost}:${DbPort}/${DbName}"

& $PhpBin -r "exit(version_compare(PHP_VERSION, '8.2.0', '>=') ? 0 : 1);"
if ($LASTEXITCODE -ne 0) {
    $version = & $PhpBin -r "echo PHP_VERSION;"
    throw "PHP minimal 8.2. Versi saat ini: $version"
}

if (!(Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Membuat .env dari .env.example"
}

$envContent = Get-Content ".env" -Raw
$envContent = [regex]::Replace(
    $envContent,
    "(?ms)\r?\n?# BEGIN IF_INSTRUMENT_SERVER_SETUP\r?\n.*?# END IF_INSTRUMENT_SERVER_SETUP\r?\n?",
    "`r`n"
)

$block = @"

# BEGIN IF_INSTRUMENT_SERVER_SETUP
CI_ENVIRONMENT = $CiEnvironment
app.baseURL = '$AppUrl'
app.indexPage = ''

database.default.hostname = $DbHost
database.default.database = $DbName
database.default.username = $DbUser
database.default.password = $DbPass
database.default.DBDriver = MySQLi
database.default.DBPrefix =
database.default.port = $DbPort
# END IF_INSTRUMENT_SERVER_SETUP
"@

Set-Content ".env" ($envContent.TrimEnd() + $block + "`r`n")

New-Item -ItemType Directory -Force -Path "writable/cache", "writable/debugbar", "writable/logs", "writable/session", "writable/uploads", "public/uploads" | Out-Null

if (!$SkipComposer) {
    if (Get-Command $ComposerBin -ErrorAction SilentlyContinue) {
        Write-Host "Menjalankan composer install..."
        & $ComposerBin install --no-dev --optimize-autoloader
    } else {
        Write-Warning "Composer tidak ditemukan, lewati composer install. Isi -ComposerBin jika path berbeda."
    }
}

if (!$SkipDbCreate) {
    if (Get-Command mysql -ErrorAction SilentlyContinue) {
        Write-Host "Membuat database pusat jika belum ada..."
        $env:MYSQL_PWD = $DbPass
        & mysql -h $DbHost -P $DbPort -u $DbUser -e "CREATE DATABASE IF NOT EXISTS ``$DbName`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
        Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue
    } else {
        Write-Warning "mysql CLI tidak ditemukan, lewati create database. Pastikan database $DbName sudah dibuat."
    }
}

if ((Select-String -Path ".env" -Pattern "^encryption\.key\s*=\s*$" -Quiet)) {
    Write-Host "Generate encryption key..."
    & $PhpBin spark key:generate
}

if (!$SkipMigrate) {
    Write-Host "Menjalankan migration database pusat..."
    & $PhpBin spark migrate
}

if ($Fresh) {
    Write-Host "Fresh seed aktif: reset database pusat dan seed Super Admin SaaS..."
    & $PhpBin spark db:seed DemoSeeder
}

Write-Host ""
Write-Host "Setup selesai."
Write-Host "Login awal jika memakai -Fresh:"
Write-Host "  Email    : superadmin@app.test"
Write-Host "  Password : super123"
Write-Host ""
Write-Host "Jalankan built-in server:"
Write-Host "  .\scripts\run-server.ps1"
Write-Host ""
Write-Host "Generate config web server:"
Write-Host "  .\scripts\webserver-config.ps1 -Server iis -Mode direct -Domain domain-anda.com -Output web.config"
Write-Host "  .\scripts\webserver-config.ps1 -Server nginx -Mode proxy -Domain domain-anda.com -Https -Output if-instrument-nginx.conf"
