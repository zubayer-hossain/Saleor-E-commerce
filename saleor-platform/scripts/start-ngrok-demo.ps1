#Requires -Version 5.1
<#
  Starts ngrok for local Docker Saleor demos: tunnels API :8000, storefront :3000, dashboard :9000.

  Writes `saleor-platform/.env.ngrok.demo.local` and runs Compose with interpolated vars so browsers
  use public HTTPS URLs. Mailpit stays on localhost unless you pass `-IncludeMailpit` and your ngrok plan
  allows a fourth simultaneous endpoint.

  One-time prereq:
    ngrok config add-authtoken <your token>

  Run:
    powershell -ExecutionPolicy Bypass -File saleor-platform/scripts/start-ngrok-demo.ps1

  Leave ngrok running for the demo; close its window when finished.
#>
param(
  [switch] $SkipDocker,
  [string] $InspectorPort = "4040",
  [switch] $NoStart,
  [switch] $NoWindow,
  [switch] $IncludeMailpit,
  [string] $NgrokExe = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function ResolveNgrokExe {
  param([string] $Preferred)
  if ($Preferred.Trim().Length -gt 0 -and (Test-Path -LiteralPath $Preferred)) {
    return (Resolve-Path -LiteralPath $Preferred).Path
  }
  $cmd = Get-Command ngrok -ErrorAction SilentlyContinue
  if ($null -ne $cmd) {
    return $cmd.Source
  }
  return $null
}

function GetUserNgrokConfigPath {
  if ($null -ne $env:OS -and $env:OS -match "Windows") {
    return (Join-Path $env:LOCALAPPDATA "ngrok\ngrok.yml")
  }
  $xdg = $env:XDG_CONFIG_HOME
  if ($xdg -and (Test-Path -LiteralPath $xdg)) {
    return (Join-Path $xdg "ngrok\ngrok.yml")
  }
  return (Join-Path $HOME ".config/ngrok/ngrok.yml")
}

function GetTunnelsFromInspector {
  param([string] $Port)
  try {
    return (Invoke-RestMethod -Uri "http://127.0.0.1:${Port}/api/tunnels" -TimeoutSec 5).tunnels
  }
  catch {
    return $null
  }
}

function TestNgrokTunnelSet {
  param($Tunnels, [string[]] $NeededTunnelNames)
  if ($null -eq $Tunnels) { return $false }
  foreach ($n in $NeededTunnelNames) {
    if (-not ($Tunnels.name -contains $n)) {
      return $false
    }
  }
  return $true
}

function GetNgrokTunnelUrlRequired {
  param($Tunnels, [string] $Name)
  $hit = $Tunnels | Where-Object { $_.name -eq $Name } | Select-Object -First 1
  if ($null -eq $hit) {
    Write-Error "Tunnel '$Name' missing. Active: $($Tunnels.name -join ', ')."
  }
  return [string]$hit.public_url
}

function TryGetNgrokTunnelUrl {
  param($Tunnels, [string] $Name)
  $hit = $Tunnels | Where-Object { $_.name -eq $Name } | Select-Object -First 1
  if ($null -eq $hit) { return $null }
  return [string]$hit.public_url
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PlatformRoot = Resolve-Path (Join-Path $ScriptDir "..")
$DemoConfig = Join-Path $PlatformRoot "ngrok.demo.yml"
$MailpitAddonConfig = Join-Path $PlatformRoot "ngrok.demo.with-mailpit.yml"
$OutEnv = Join-Path $PlatformRoot ".env.ngrok.demo.local"
$UserNgrok = GetUserNgrokConfigPath

$neededTunnelNames = @("saleor-api", "saleor-storefront", "saleor-dashboard")
if ($IncludeMailpit) {
  if (-not (Test-Path -LiteralPath $MailpitAddonConfig)) {
    Write-Error "IncludeMailpit was set but $MailpitAddonConfig is missing."
  }
  $neededTunnelNames += "mailpit"
}

if (-not (Test-Path -LiteralPath $DemoConfig)) {
  Write-Error "Missing ngrok.demo.yml at $DemoConfig"
}
if (-not (Test-Path -LiteralPath $UserNgrok)) {
  Write-Error "Ngrok user config missing at $UserNgrok (run ngrok config add-authtoken <token>)."
}

$ngExe = ResolveNgrokExe $NgrokExe
if ($null -eq $ngExe) {
  Write-Error "ngrok CLI not found. Install ngrok and add it to PATH."
}

$tunnels = GetTunnelsFromInspector -Port $InspectorPort
$tunnelHint = "$( @('saleor-api', 'saleor-storefront', 'saleor-dashboard') -join ', ')"
if ($IncludeMailpit) { $tunnelHint += ", mailpit" }

if ($NoStart -and -not (TestNgrokTunnelSet $tunnels $neededTunnelNames)) {
  Write-Error "Incomplete tunnel set vs required ($tunnelHint). Omit -NoStart to launch ngrok, or inspect http://127.0.0.1:${InspectorPort}/"
}

if ((-not $NoStart) -and -not (TestNgrokTunnelSet $tunnels $neededTunnelNames)) {
  Write-Host "Launching ngrok (configs: user defaults + repository tunnel file$( if ($IncludeMailpit) {' + mailpit addon'} ))..." -ForegroundColor Cyan
  $spawnArgs = New-Object System.Collections.Generic.List[string]
  [void]$spawnArgs.Add("start")
  [void]$spawnArgs.Add("--all")
  [void]$spawnArgs.Add("--config")
  [void]$spawnArgs.Add($UserNgrok)
  [void]$spawnArgs.Add("--config")
  [void]$spawnArgs.Add($DemoConfig)
  if ($IncludeMailpit) {
    [void]$spawnArgs.Add("--config")
    [void]$spawnArgs.Add($MailpitAddonConfig)
  }
  if ($NoWindow) {
    Start-Process -FilePath $ngExe -ArgumentList $spawnArgs -WindowStyle Hidden
  }
  else {
    Start-Process -FilePath $ngExe -ArgumentList $spawnArgs -WindowStyle Minimized
  }

  $deadline = (Get-Date).AddSeconds(60)
  $tunnels = $null
  while ((Get-Date) -lt $deadline) {
    $tunnels = GetTunnelsFromInspector -Port $InspectorPort
    if (TestNgrokTunnelSet $tunnels $neededTunnelNames) { break }
    Start-Sleep -Milliseconds 500
  }
}

if (-not (TestNgrokTunnelSet $tunnels $neededTunnelNames)) {
  Write-Host ""
  Write-Host "If ngrok exited immediately: your plan may cap simultaneous tunnels (omit -IncludeMailpit), or your authtoken may be invalid." -ForegroundColor Yellow
  Write-Error "Timed out before required tunnels ($tunnelHint) registered. Inspect http://127.0.0.1:${InspectorPort}/."
}

$urlApi = GetNgrokTunnelUrlRequired $tunnels "saleor-api"
$urlSf = GetNgrokTunnelUrlRequired $tunnels "saleor-storefront"
$urlDash = GetNgrokTunnelUrlRequired $tunnels "saleor-dashboard"
$urlMail = TryGetNgrokTunnelUrl $tunnels "mailpit"
if (-not $urlMail -or ($urlMail.Length -eq 0)) {
  $urlMailDisplay = "http://localhost:8025/"
}
else {
  $urlMailDisplay = "$($urlMail.TrimEnd('/'))/"
}

$graphql = ($urlApi.TrimEnd("/") + "/graphql/")
$sfOrigin = $urlSf.TrimEnd("/")
$dashUrl = $urlDash.TrimEnd("/") + "/"
$apiHost = ([Uri]$urlApi).Host
$allowedHosts = "localhost,127.0.0.1,api,host.docker.internal,$apiHost"
$allowedClientHosts = "http://localhost:3000,http://127.0.0.1:3000,$sfOrigin"

$lines = @(
  "# Generated by scripts/start-ngrok-demo.ps1 - do not commit.",
  "SALEOR_ALLOWED_HOSTS=$allowedHosts",
  "SALEOR_ALLOWED_CLIENT_HOSTS=$allowedClientHosts",
  "SALEOR_DASHBOARD_URL=$dashUrl",
  "SALEOR_DASHBOARD_API_URL=$graphql",
  "NEXT_PUBLIC_SALEOR_API_URL=$graphql",
  "NEXT_PUBLIC_STOREFRONT_URL=$sfOrigin"
)
Set-Content -LiteralPath $OutEnv -Value $lines -Encoding utf8

Write-Host ""
Write-Host "Public URLs:" -ForegroundColor Green
Write-Host ("  Saleor GraphQL (browser): {0}" -f $graphql)
Write-Host ("  Storefront:               {0}/" -f $sfOrigin)
Write-Host ("  Dashboard:                {0}" -f $dashUrl)
Write-Host ("  Mailpit:                  {0}" -f $urlMailDisplay)
Write-Host ""
Write-Host "Wrote: $OutEnv" -ForegroundColor Green
Write-Host 'Then from saleor-platform/: docker compose --env-file .env.ngrok.demo.local up -d api worker dashboard storefront'
Write-Host "Ngrok inspector: http://127.0.0.1:${InspectorPort}/" -ForegroundColor DarkGray

if (-not $SkipDocker) {
  Write-Host ""
  Write-Host "Restarting Docker services api, worker, storefront (pass -SkipDocker to skip)." -ForegroundColor Cyan
  Push-Location $PlatformRoot
  try {
    & docker compose --env-file ./.env.ngrok.demo.local up -d api worker dashboard storefront
  }
  finally {
    Pop-Location
  }
}
