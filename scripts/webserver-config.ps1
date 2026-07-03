param(
    [ValidateSet("apache", "nginx", "iis")]
    [string]$Server = "",
    [ValidateSet("direct", "proxy")]
    [string]$Mode = "",
    [string]$Domain = "",
    [string]$ProjectDir = "",
    [int]$Port = 8081,
    [string]$ProxyHost = "127.0.0.1",
    [string]$ProxyPath = "/",
    [string]$PhpFpm = "127.0.0.1:9000",
    [switch]$Https,
    [switch]$Ssl,
    [string]$CertPath = "",
    [string]$KeyPath = "",
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
    Write-Host "  .\scripts\webserver-config.ps1 -Server nginx -Mode proxy -Domain domain.com -ProxyHost 10.10.10.20 -Port 8081 -ProxyPath /IF/ -Ssl"
    exit 1
}

$ProjectDir = $ProjectDir.TrimEnd("\", "/")
$PublicDir = Join-Path $ProjectDir "public"
if (!$ProxyPath) { $ProxyPath = "/" }
if (!$ProxyPath.StartsWith("/")) { $ProxyPath = "/" + $ProxyPath }
if (!$ProxyPath.EndsWith("/")) { $ProxyPath = $ProxyPath + "/" }
$ProxyPathNoTrailing = $ProxyPath.TrimEnd("/")
if (!$ProxyPathNoTrailing) { $ProxyPathNoTrailing = "/" }
$Proto = if ($Https -or $Ssl) { "https" } else { "http" }
$ForwardedPort = if ($Https -or $Ssl) { "443" } else { "80" }
$NginxPublicDir = ($PublicDir -replace "\\", "/")
if (!$CertPath) { $CertPath = "/etc/letsencrypt/live/$Domain/fullchain.pem" }
if (!$KeyPath) { $KeyPath = "/etc/letsencrypt/live/$Domain/privkey.pem" }

function Render-ApacheDirect {
if ($Ssl) {
@"
<VirtualHost *:80>
    ServerName $Domain
    Redirect permanent / https://$Domain/
</VirtualHost>

<VirtualHost *:443>
    ServerName $Domain
    DocumentRoot "$PublicDir"

    SSLEngine on
    SSLCertificateFile "$CertPath"
    SSLCertificateKeyFile "$KeyPath"

    <Directory "$PublicDir">
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    ErrorLog logs/if-instrument-ssl-error.log
    CustomLog logs/if-instrument-ssl-access.log combined
</VirtualHost>
"@
return
}

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
if ($Ssl) {
@"
<VirtualHost *:80>
    ServerName $Domain
    Redirect permanent / https://$Domain/
</VirtualHost>

<VirtualHost *:443>
    ServerName $Domain

    SSLEngine on
    SSLCertificateFile "$CertPath"
    SSLCertificateKeyFile "$KeyPath"

    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "https"
    RequestHeader set X-Forwarded-Port "443"

    ProxyPass $ProxyPath http://${ProxyHost}:${Port}${ProxyPath}
    ProxyPassReverse $ProxyPath http://${ProxyHost}:${Port}${ProxyPath}

    ErrorLog logs/if-instrument-proxy-ssl-error.log
    CustomLog logs/if-instrument-proxy-ssl-access.log combined
</VirtualHost>
"@
return
}

@"
<VirtualHost *:80>
    ServerName $Domain

    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "$Proto"
    RequestHeader set X-Forwarded-Port "$ForwardedPort"

    ProxyPass $ProxyPath http://${ProxyHost}:${Port}${ProxyPath}
    ProxyPassReverse $ProxyPath http://${ProxyHost}:${Port}${ProxyPath}

    ErrorLog logs/if-instrument-proxy-error.log
    CustomLog logs/if-instrument-proxy-access.log combined
</VirtualHost>
"@
}

function Render-NginxDirect {
if ($Ssl) {
@"
server {
    listen 80;
    server_name $Domain;
    return 301 https://`$host`$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $Domain;

    ssl_certificate $CertPath;
    ssl_certificate_key $KeyPath;

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
return
}

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
if ($Ssl) {
$ExactRedirect = ""
if ($ProxyPath -ne "/") {
    $ExactRedirect = @"

    location = $ProxyPathNoTrailing {
        return 301 https://`$host$ProxyPath;
    }
"@
}
@"
server {
    listen 80;
    server_name $Domain;
    return 301 https://`$host`$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $Domain;
    client_max_body_size 20M;

    ssl_certificate $CertPath;
    ssl_certificate_key $KeyPath;
$ExactRedirect

    location $ProxyPath {
        proxy_pass http://${ProxyHost}:${Port};
        proxy_http_version 1.1;
        proxy_set_header Host `$host;
        proxy_set_header X-Real-IP `$remote_addr;
        proxy_set_header X-Forwarded-For `$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Port 443;
    }
}
"@
return
}

$ExactRedirect = ""
if ($ProxyPath -ne "/") {
    $ExactRedirect = @"

    location = $ProxyPathNoTrailing {
        return 301 `$scheme://`$host$ProxyPath;
    }
"@
}
@"
server {
    listen 80;
    server_name $Domain;
    client_max_body_size 20M;
$ExactRedirect

    location $ProxyPath {
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
if ($Ssl) {
    Write-Warning "Untuk IIS, SSL Let's Encrypt biasanya dipasang di binding IIS. Gunakan win-acme, lalu pakai web.config direct ini."
}
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
if ($Ssl) {
    Write-Warning "Untuk IIS, SSL Let's Encrypt biasanya dipasang di binding IIS. Gunakan win-acme, lalu pakai web.config proxy ini."
}
@"
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="Reverse Proxy to IF Instrument" stopProcessing="true">
          <match url="^$($ProxyPath.Trim('/'))/(.*)$" />
          <action type="Rewrite" url="http://${ProxyHost}:${Port}$ProxyPath{R:1}" />
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
        if ($Ssl) { Write-Host "  Gunakan win-acme untuk Let's Encrypt dan binding HTTPS di IIS." }
    } else {
        Write-Host "  Install IIS URL Rewrite dan ARR, aktifkan proxy ARR."
        Write-Host "  Simpan output sebagai web.config pada root site."
        Write-Host "  Jalankan app internal: .\scripts\run-server.ps1 -HostName $ProxyHost -Port $Port"
        Write-Host "  Public path yang diproxy: ${Proto}://${Domain}${ProxyPath}"
        if ($Ssl) { Write-Host "  Gunakan win-acme untuk Let's Encrypt dan binding HTTPS di IIS." }
    }
} elseif ($Server -eq "apache") {
    Write-Host "  Simpan config ke conf/extra atau sites-available sesuai instalasi Apache."
    if ($Mode -eq "proxy") {
        Write-Host "  Aktifkan module proxy, proxy_http, headers, rewrite."
        Write-Host "  Jalankan app internal: .\scripts\run-server.ps1 -HostName $ProxyHost -Port $Port"
        Write-Host "  Public path yang diproxy: ${Proto}://${Domain}${ProxyPath}"
    }
    if ($Ssl) { Write-Host "  Buat sertifikat: certbot certonly --webroot -w $PublicDir -d $Domain" }
} else {
    Write-Host "  Simpan config ke conf.d/sites-enabled sesuai instalasi Nginx."
    if ($Mode -eq "proxy") {
        Write-Host "  Jalankan app internal: .\scripts\run-server.ps1 -HostName $ProxyHost -Port $Port"
        Write-Host "  Public path yang diproxy: ${Proto}://${Domain}${ProxyPath}"
    }
    if ($Ssl) { Write-Host "  Buat sertifikat: certbot certonly --webroot -w $PublicDir -d $Domain" }
}
