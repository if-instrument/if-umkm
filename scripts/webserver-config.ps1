param(
    [ValidateSet("apache", "nginx", "iis")]
    [string]$Server = "",
    [ValidateSet("direct", "proxy")]
    [string]$Mode = "",
    [string]$Domain = "",
    [string]$ProjectDir = "",
    [int]$Port = 8081,
    [string]$ProxyHost = "127.0.0.1",
    [string]$PhpFpm = "127.0.0.1:9000",
    [switch]$Https,
    [string]$Output = ""
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (!$ProjectDir) { $ProjectDir = $RootDir }
if (!$Server -or !$Mode -or !$Domain) {
    Write-Host "Usage:"
    Write-Host "  .\scripts\webserver-config.ps1 -Server apache|nginx|iis -Mode direct|proxy -Domain domain.com [options]"
    Write-Host ""
    Write-Host "Contoh:"
    Write-Host "  .\scripts\webserver-config.ps1 -Server iis -Mode direct -Domain app.local -Output web.config"
    Write-Host "  .\scripts\webserver-config.ps1 -Server iis -Mode proxy -Domain app.local -Port 8081 -Output web.config"
    Write-Host "  .\scripts\webserver-config.ps1 -Server apache -Mode direct -Domain app.local -ProjectDir C:\apps\if-instrument -Output if-instrument.conf"
    Write-Host "  .\scripts\webserver-config.ps1 -Server nginx -Mode proxy -Domain app.local -Port 8081 -Https -Output if-instrument.conf"
    exit 1
}

$ProjectDir = $ProjectDir.TrimEnd("\", "/")
$PublicDir = Join-Path $ProjectDir "public"
$Proto = if ($Https) { "https" } else { "http" }
$ForwardedPort = if ($Https) { "443" } else { "80" }
$NginxPublicDir = ($PublicDir -replace "\\", "/")

function Render-ApacheDirect {
@"
<VirtualHost *:80>
    ServerName $Domain
    DocumentRoot "$PublicDir"

    <Directory "$PublicDir">
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    ErrorLog logs/if-instrument-error.log
    CustomLog logs/if-instrument-access.log combined
</VirtualHost>
"@
}

function Render-ApacheProxy {
@"
<VirtualHost *:80>
    ServerName $Domain

    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "$Proto"
    RequestHeader set X-Forwarded-Port "$ForwardedPort"

    ProxyPass / http://${ProxyHost}:${Port}/
    ProxyPassReverse / http://${ProxyHost}:${Port}/

    ErrorLog logs/if-instrument-proxy-error.log
    CustomLog logs/if-instrument-proxy-access.log combined
</VirtualHost>
"@
}

function Render-NginxDirect {
@"
server {
    listen 80;
    server_name $Domain;

    root $NginxPublicDir;
    index index.php index.html;
    client_max_body_size 20M;

    location / {
        try_files `$uri `$uri/ /index.php?`$query_string;
    }

    location ~ \.php$ {
        include fastcgi_params;
        fastcgi_pass $PhpFpm;
        fastcgi_param SCRIPT_FILENAME `$document_root`$fastcgi_script_name;
        fastcgi_param PATH_INFO `$fastcgi_path_info;
    }

    location ~ /\.(?!well-known).* {
        deny all;
    }
}
"@
}

function Render-NginxProxy {
@"
server {
    listen 80;
    server_name $Domain;
    client_max_body_size 20M;

    location / {
        proxy_pass http://${ProxyHost}:${Port};
        proxy_http_version 1.1;
        proxy_set_header Host `$host;
        proxy_set_header X-Real-IP `$remote_addr;
        proxy_set_header X-Forwarded-For `$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $Proto;
        proxy_set_header X-Forwarded-Port $ForwardedPort;
    }
}
"@
}

function Render-IisDirect {
@"
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <defaultDocument>
      <files>
        <clear />
        <add value="index.php" />
        <add value="index.html" />
      </files>
    </defaultDocument>
    <rewrite>
      <rules>
        <rule name="CodeIgniter Front Controller" stopProcessing="true">
          <match url="^(.*)$" />
          <conditions logicalGrouping="MatchAll">
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
          </conditions>
          <action type="Rewrite" url="index.php/{R:1}" appendQueryString="true" />
        </rule>
      </rules>
    </rewrite>
    <security>
      <requestFiltering>
        <hiddenSegments>
          <add segment=".git" />
          <add segment="app" />
          <add segment="writable" />
          <add segment="vendor" />
        </hiddenSegments>
      </requestFiltering>
    </security>
  </system.webServer>
</configuration>
"@
}

function Render-IisProxy {
@"
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="Reverse Proxy to IF Instrument" stopProcessing="true">
          <match url="(.*)" />
          <action type="Rewrite" url="http://${ProxyHost}:${Port}/{R:1}" />
          <serverVariables>
            <set name="HTTP_X_FORWARDED_PROTO" value="$Proto" />
            <set name="HTTP_X_FORWARDED_PORT" value="$ForwardedPort" />
          </serverVariables>
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>
"@
}

$Config = switch ("${Server}:${Mode}") {
    "apache:direct" { Render-ApacheDirect }
    "apache:proxy" { Render-ApacheProxy }
    "nginx:direct" { Render-NginxDirect }
    "nginx:proxy" { Render-NginxProxy }
    "iis:direct" { Render-IisDirect }
    "iis:proxy" { Render-IisProxy }
}

if ($Output) {
    Set-Content -Path $Output -Value $Config
    Write-Host "Config tersimpan: $Output"
} else {
    Write-Output $Config
}

Write-Host ""
Write-Host "Langkah berikutnya:"
if ($Server -eq "iis") {
    if ($Mode -eq "direct") {
        Write-Host "  Set IIS Site Physical Path ke: $PublicDir"
        Write-Host "  Simpan output sebagai web.config di folder public."
    } else {
        Write-Host "  Install IIS URL Rewrite dan ARR, aktifkan proxy ARR."
        Write-Host "  Simpan output sebagai web.config pada root site."
        Write-Host "  Jalankan app internal: .\scripts\run-server.ps1 -HostName $ProxyHost -Port $Port"
    }
} elseif ($Server -eq "apache") {
    Write-Host "  Simpan config ke conf/extra atau sites-available sesuai instalasi Apache."
    if ($Mode -eq "proxy") {
        Write-Host "  Aktifkan module proxy, proxy_http, headers, rewrite."
        Write-Host "  Jalankan app internal: .\scripts\run-server.ps1 -HostName $ProxyHost -Port $Port"
    }
} else {
    Write-Host "  Simpan config ke conf.d/sites-enabled sesuai instalasi Nginx."
    if ($Mode -eq "proxy") {
        Write-Host "  Jalankan app internal: .\scripts\run-server.ps1 -HostName $ProxyHost -Port $Port"
    }
}
