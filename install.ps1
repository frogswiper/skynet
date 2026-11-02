# SKYNET installer for Windows 10 / 11
#   irm https://raw.githubusercontent.com/frogswiper/skynet/main/install.ps1 | iex
#
# 1. installs Ollama if it is missing (winget, or the official OllamaSetup.exe)
# 2. makes sure the Ollama server is running
# 3. signs in to ollama.com (cloud models need an account)
# 4. finds the newest GLM cloud model on ollama.com and pulls it (e.g. glm-5.3:cloud)
# 5. uses Node.js 18+ if installed, otherwise a private checksum-verified Node 22 (no admin)
# 6. downloads SKYNET, adds Start Menu + desktop shortcuts and the `skynet` command, starts it
#
# Options: set them first, e.g.  $env:SKYNET_MODEL = 'glm-5.2:cloud'; irm ... | iex
#   SKYNET_MODEL  SKYNET_PORT (8484)  SKYNET_NO_LAUNCH=1  SKYNET_BRANCH (main)
# No administrator rights are needed (the Ollama installer may ask on some systems).

& {
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

function Say($m) { Write-Host '> ' -NoNewline -ForegroundColor White; Write-Host $m }
function Ok($m)  { Write-Host '  ... OK ' -NoNewline -ForegroundColor Red; Write-Host $m }
function Note($m) { Write-Host "  $m" -ForegroundColor DarkGray }
function Die($m) { throw $m }
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
function Test-Url($u) {
  try { $null = Invoke-WebRequest -UseBasicParsing -Uri $u -TimeoutSec 3 -ErrorAction Stop; return $true } catch { return $false }
}
function Get-File($url, $out) { Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $out -ErrorAction Stop }

try {
  Write-Host @'
   ____  _  ____   ___   _ _____ _____
  / ___|| |/ /\ \ / / \ | | ____|_   _|
  \___ \| ' /  \ V /|  \| |  _|   | |
   ___) | . \   | | | |\  | |___  | |
  |____/|_|\_\  |_| |_| \_|_____| |_|
'@ -ForegroundColor Red
  Write-Host "  NEURAL NET-BASED ARTIFICIAL INTELLIGENCE  //  WINDOWS INSTALLER`n" -ForegroundColor DarkGray

  $Repo = 'frogswiper/skynet'
  $Branch = 'main'; if ($env:SKYNET_BRANCH) { $Branch = $env:SKYNET_BRANCH }
  $Fallback = 'glm-5.3:cloud'
  $Data = Join-Path $env:LOCALAPPDATA 'skynet'
  $App = Join-Path $Data 'app'
  $ConfDir = Join-Path $env:APPDATA 'skynet'
  $OllamaUrl = 'http://127.0.0.1:11434'; if ($env:OLLAMA_URL) { $OllamaUrl = $env:OLLAMA_URL }
  if (-not [Environment]::Is64BitOperatingSystem) { Die '64-bit Windows is required' }
  $arch = 'x64'
  if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { $arch = 'arm64' }
  New-Item -ItemType Directory -Force -Path $Data, $ConfDir | Out-Null

  # ---------- 1. Ollama ----------
  Say 'CHECKING OLLAMA RUNTIME'
  $OllamaDir = Join-Path $env:LOCALAPPDATA 'Programs\Ollama'
  Refresh-Path
  if (-not (Get-Command ollama -ErrorAction SilentlyContinue) -and (Test-Path (Join-Path $OllamaDir 'ollama.exe'))) { $env:Path += ";$OllamaDir" }
  if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
    Say 'OLLAMA NOT FOUND - INSTALLING'
    $done = $false
    if (Get-Command winget -ErrorAction SilentlyContinue) {
      & winget install -e --id Ollama.Ollama --accept-source-agreements --accept-package-agreements --silent
      $done = ($LASTEXITCODE -eq 0)
    }
    if (-not $done) {
      $setup = Join-Path $env:TEMP 'OllamaSetup.exe'
      Note 'downloading OllamaSetup.exe from ollama.com ...'
      Get-File 'https://ollama.com/download/OllamaSetup.exe' $setup
      Start-Process -FilePath $setup -ArgumentList '/VERYSILENT', '/NORESTART', '/SUPPRESSMSGBOXES' -Wait
      Remove-Item $setup -Force -ErrorAction SilentlyContinue
    }
    Refresh-Path
    if (Test-Path (Join-Path $OllamaDir 'ollama.exe')) { $env:Path += ";$OllamaDir" }
    if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) { Die 'Ollama install failed - install it from https://ollama.com/download and run this again' }
  }
  Ok ((& ollama --version 2>$null) | Select-Object -First 1)

  # ---------- 2. Ollama server ----------
  Say "ESTABLISHING UPLINK TO $OllamaUrl"
  if (-not (Test-Url "$OllamaUrl/api/version")) {
    $tray = Join-Path $OllamaDir 'ollama app.exe'
    if (Test-Path $tray) { Start-Process -FilePath $tray } else { Start-Process -FilePath 'ollama' -ArgumentList 'serve' -WindowStyle Hidden }
    for ($i = 0; $i -lt 60 -and -not (Test-Url "$OllamaUrl/api/version"); $i++) { Start-Sleep -Milliseconds 500 }
  }
  if (-not (Test-Url "$OllamaUrl/api/version")) { Die "Ollama server is not answering on $OllamaUrl" }
  Ok 'ONLINE'

  # ---------- 3. Sign in ----------
  Say 'AUTHENTICATING WITH ollama.com (cloud models need an account)'
  Note 'If a link is shown, open it in a browser, approve, and this continues.'
  & ollama signin
  if ($LASTEXITCODE -ne 0) { Die "ollama signin failed - run 'ollama signin' and run this installer again" }
  Ok 'SIGNED IN'

  # ---------- 4. Newest GLM cloud model ----------
  Say 'LOCATING NEWEST GLM CLOUD MODULE'
  if ($env:SKYNET_MODEL) { $Model = $env:SKYNET_MODEL } else {
    $latest = $null
    try {
      $html = (Invoke-WebRequest -UseBasicParsing -Uri 'https://ollama.com/search?c=cloud&q=glm' -TimeoutSec 20 -ErrorAction Stop).Content
      $names = [regex]::Matches($html, 'href="/library/(glm-[0-9]+(?:\.[0-9]+)*)"') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
      $latest = $names | Sort-Object { $v = $_.Substring(4); if ($v -notmatch '\.') { $v += '.0' }; [version]$v } | Select-Object -Last 1
    } catch { $latest = $null }
    if ($latest) { $Model = "${latest}:cloud" } else { $Model = $Fallback }
  }
  Ok $Model
  Say "PULLING $Model"
  & ollama pull $Model
  if ($LASTEXITCODE -ne 0) {
    if ($Model -eq $Fallback) { Die "could not pull $Model" }
    Say "PULL FAILED - FALLING BACK TO $Fallback"
    $Model = $Fallback
    & ollama pull $Model
    if ($LASTEXITCODE -ne 0) { Die "could not pull $Model" }
  }
  Ok 'MODULE READY'

  # ---------- Node.js ----------
  Say 'CHECKING NODE.JS (18+)'
  $NodeExe = $null
  $sys = Get-Command node -ErrorAction SilentlyContinue
  if ($sys) {
    $ver = (& node --version 2>$null) | Select-Object -First 1
    if ($ver -match '^v(\d+)\.' -and [int]$Matches[1] -ge 18) { $NodeExe = $sys.Source; Ok "system node $ver" }
  }
  if (-not $NodeExe -and (Test-Path (Join-Path $Data 'node\node.exe'))) {
    $NodeExe = Join-Path $Data 'node\node.exe'
    Ok "private node $((& $NodeExe --version) | Select-Object -First 1)"
  }
  if (-not $NodeExe) {
    $base = 'https://nodejs.org/dist/latest-v22.x'
    $sums = (Invoke-WebRequest -UseBasicParsing -Uri "$base/SHASUMS256.txt" -ErrorAction Stop).Content
    $line = ($sums -split "`n") | Where-Object { $_ -match "node-v[0-9.]+-win-$arch\.zip\s*$" } | Select-Object -First 1
    if (-not $line) { Die "could not find a Node.js build for win-$arch" }
    $sum, $file = $line.Trim() -split '\s+'
    $tmp = Join-Path $env:TEMP ('skynet-node-' + [guid]::NewGuid())
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null
    Say "DOWNLOADING $file"
    Get-File "$base/$file" (Join-Path $tmp $file)
    if ((Get-FileHash -Algorithm SHA256 -Path (Join-Path $tmp $file)).Hash -ne $sum.ToUpper()) { Die 'Node.js checksum mismatch' }
    Expand-Archive -Path (Join-Path $tmp $file) -DestinationPath $tmp -Force
    $inner = Get-ChildItem -Path $tmp -Directory | Select-Object -First 1
    $nodeDir = Join-Path $Data 'node'
    if (Test-Path $nodeDir) { Remove-Item $nodeDir -Recurse -Force }
    Move-Item -Path $inner.FullName -Destination $nodeDir
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    $NodeExe = Join-Path $nodeDir 'node.exe'
    Ok "private node $((& $NodeExe --version) | Select-Object -First 1) in $nodeDir"
  }

  # ---------- SKYNET ----------
  Say "DOWNLOADING SKYNET ($Repo@$Branch)"
  # Stop a server left running by a previous install before its files are replaced.
  $oldServer = Join-Path $App 'server.js'
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains($oldServer) } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  # Install an exact commit and remember it, so updates can tell what is installed.
  $Sha = $null
  try { $Sha = (Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/commits/$Branch" -TimeoutSec 20 -ErrorAction Stop).sha } catch { $Sha = $null }
  if ($Sha -notmatch '^[0-9a-f]{40}$') { $Sha = $null }
  $ref = "refs/heads/$Branch"; if ($Sha) { $ref = $Sha }
  $tmp = Join-Path $env:TEMP ('skynet-app-' + [guid]::NewGuid())
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  Get-File "https://codeload.github.com/$Repo/zip/$ref" (Join-Path $tmp 'app.zip')
  Expand-Archive -Path (Join-Path $tmp 'app.zip') -DestinationPath $tmp -Force
  $inner = Get-ChildItem -Path $tmp -Directory | Select-Object -First 1
  if (-not $inner -or -not (Test-Path (Join-Path $inner.FullName 'server.js'))) { Die 'download did not contain server.js' }
  $ver = 'unknown'; if ($Sha) { $ver = $Sha }
  Set-Content -Path (Join-Path $inner.FullName '.version') -Value $ver -Encoding ASCII
  Set-Location $Data
  foreach ($d in @($App, (Join-Path $Data 'staged'))) { if (Test-Path $d) { Remove-Item $d -Recurse -Force } }
  Move-Item -Path $inner.FullName -Destination $App
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
  $short = 'unknown'; if ($Sha) { $short = $Sha.Substring(0, 7) }
  Ok "$App (version $short)"

  # Settings this installer does not manage (e.g. SKYNET_BROWSER=chrome) are kept.
  $confFile = Join-Path $ConfDir 'skynet.env'
  $keep = @()
  if (Test-Path $confFile) {
    $keep = @(Get-Content $confFile | Where-Object { $_ -match '^[A-Za-z_][A-Za-z0-9_]*=' -and $_ -notmatch '^(SKYNET_MODEL|SKYNET_NODE|OLLAMA_URL|SKYNET_PORT|WOPR_TTS|ESPEAK_DATA_PATH)=' })
  }
  $conf = @(
    '# Written by the SKYNET installer. Edit and restart SKYNET to change.',
    "SKYNET_MODEL=$Model",
    "SKYNET_NODE=$NodeExe",
    "OLLAMA_URL=$OllamaUrl"
  )
  if ($env:SKYNET_PORT) { $conf += "SKYNET_PORT=$($env:SKYNET_PORT)" }
  $conf += $keep
  Set-Content -Path (Join-Path $ConfDir 'skynet.env') -Value $conf -Encoding ASCII
  Ok "config $(Join-Path $ConfDir 'skynet.env')"

  # Start Menu + desktop shortcuts, and the 'skynet' command for new terminals.
  $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $launch = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$(Join-Path $App 'skynet.ps1')`""
  $ws = New-Object -ComObject WScript.Shell
  foreach ($dir in @([Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('Desktop'))) {
    $lnk = $ws.CreateShortcut((Join-Path $dir 'SKYNET.lnk'))
    $lnk.TargetPath = $ps
    $lnk.Arguments = $launch
    $lnk.WorkingDirectory = $Data      # not the app folder: updates rename it
    $lnk.IconLocation = (Join-Path $App 'public\skynet.ico')
    $lnk.Description = 'Cyberdyne Systems operator terminal for Ollama'
    $lnk.WindowStyle = 7
    $lnk.Save()
  }
  Ok 'Start Menu and desktop shortcuts: SKYNET'
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if (-not $userPath) { $userPath = '' }
  if (($userPath -split ';') -notcontains $App) {
    [Environment]::SetEnvironmentVariable('Path', (($userPath.TrimEnd(';') + ';' + $App).TrimStart(';')), 'User')
  }
  Ok "command 'skynet' (in new terminals)"

  Write-Host ''
  Say 'SKYNET INSTALLED. DEFENSE NETWORK STATUS: ONLINE'
  Note "Start it from the Start Menu or desktop shortcut, or type 'skynet' in a new terminal. Press Esc to exit."
  if (-not $env:SKYNET_NO_LAUNCH) { Start-Process -FilePath $ps -ArgumentList $launch -WindowStyle Hidden }
} catch {
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
}
}
