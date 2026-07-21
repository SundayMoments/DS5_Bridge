param(
  [string] $OutputRoot = [Environment]::GetFolderPath('MyDocuments'),
  [string] $Configuration = 'Release',
  [switch] $SkipBuild,
  [switch] $NoZip,
  [switch] $ValidateOnly,
  [string] $Label = ''
)

$ErrorActionPreference = 'Stop'

function Resolve-RepoRoot {
  $scriptPath = $PSScriptRoot
  if (-not $scriptPath) {
    throw 'Unable to resolve script root.'
  }
  return (Resolve-Path (Join-Path $scriptPath '..')).Path
}

function Read-JsonFile([string] $Path) {
  return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
}

function Read-FirmwareVersion([string] $VersionFilePath) {
  $version = (Get-Content -LiteralPath $VersionFilePath -Raw).Trim()
  if ($version -notmatch '^\d+\.\d+\.\d+$') {
    throw "Unable to read firmware version from $VersionFilePath"
  }
  return $version
}

function Read-BundledFirmwareVersion([string] $BridgeServiceSourcePath) {
  $source = Get-Content -LiteralPath $BridgeServiceSourcePath -Raw
  $version = [regex]::Match($source, "BUNDLED_FIRMWARE_VERSION\s*=\s*'(\d+\.\d+\.\d+)'")
  if (-not $version.Success) {
    throw "Unable to read bundled firmware version from $BridgeServiceSourcePath"
  }
  return $version.Groups[1].Value
}

function Invoke-Step([string] $Name, [scriptblock] $Action) {
  Write-Host ""
  Write-Host "==> $Name"
  & $Action
}

function Invoke-Native([string] $Name, [scriptblock] $Action) {
  & $Action
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE"
  }
}

function Copy-Directory([string] $Source, [string] $Destination) {
  if (Test-Path -LiteralPath $Destination) {
    Remove-Item -LiteralPath $Destination -Recurse -Force
  }
  Copy-Item -LiteralPath $Source -Destination $Destination -Recurse -Force
}

function Get-GitValue([string] $Arguments, [string] $Fallback = 'unknown') {
  try {
    $value = (git -C $repoRoot $Arguments.Split(' ') 2>$null | Out-String).Trim()
    if ([string]::IsNullOrWhiteSpace($value)) {
      return $Fallback
    }
    return $value
  } catch {
    return $Fallback
  }
}

function Write-SourceNotice([string] $Path) {
  $commit = Get-GitValue 'rev-parse HEAD'
  $dirty = if ([string]::IsNullOrWhiteSpace((Get-GitValue 'status --porcelain' ''))) { 'no' } else { 'yes' }
  @(
    'DS5 Bridge source code:',
    'https://github.com/SundayMoments/DS5_Bridge',
    '',
    "This binary release corresponds to commit: $commit",
    "Working tree dirty at build time: $dirty",
    '',
    'License:',
    'GNU Affero General Public License v3.0 only',
    'See LICENSE and NOTICE.'
  ) | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Get-SourceMetadata {
  $commit = Get-GitValue 'rev-parse HEAD'
  $dirty = -not [string]::IsNullOrWhiteSpace((Get-GitValue 'status --porcelain' ''))
  return [ordered]@{
    sourceUrl = 'https://github.com/SundayMoments/DS5_Bridge'
    sourceCommit = $commit
    dirty = $dirty
  }
}

function Assert-SemanticVersion([string] $Name, [string] $Version) {
  if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    throw "$Name version must use MAJOR.MINOR.PATCH format. Found: $Version"
  }
}

$repoRoot = Resolve-RepoRoot
$companionRoot = Join-Path $repoRoot 'companion'
$firmwareBuildDir = Join-Path $repoRoot 'build\companion'
$firmwareOutput = Join-Path $firmwareBuildDir 'ds5-bridge.uf2'
$installerDir = Join-Path $companionRoot 'artifacts\installer'
$portableArtifactsDir = Join-Path $companionRoot 'artifacts'
$companionPackage = Read-JsonFile (Join-Path $companionRoot 'package.json')
$companionVersion = [string] $companionPackage.version
$firmwareVersion = Read-FirmwareVersion (Join-Path $repoRoot 'firmware-version.txt')
$bundledFirmwareVersion = Read-BundledFirmwareVersion (Join-Path $companionRoot 'src\main\bridge-service.ts')
$stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$labelSuffix = if ([string]::IsNullOrWhiteSpace($Label)) { '' } else { " $($Label.Trim())" }
$releaseDir = Join-Path $OutputRoot "DS5 Bridge Release Candidate$labelSuffix $stamp"

if (-not (Test-Path -LiteralPath $OutputRoot)) {
  New-Item -ItemType Directory -Path $OutputRoot | Out-Null
}

Assert-SemanticVersion 'Companion' $companionVersion
Assert-SemanticVersion 'Firmware' $firmwareVersion
Assert-SemanticVersion 'Bundled firmware' $bundledFirmwareVersion
if ($bundledFirmwareVersion -ne $firmwareVersion) {
  throw "Bundled firmware version must match firmware version. Found bundled=$bundledFirmwareVersion firmware=$firmwareVersion"
}

if ($ValidateOnly) {
  $requiredFiles = @(
    (Join-Path $repoRoot 'LICENSE'),
    (Join-Path $repoRoot 'NOTICE'),
    (Join-Path $repoRoot 'firmware-version.txt'),
    (Join-Path $companionRoot 'package.json'),
    (Join-Path $repoRoot 'src\companion.cpp')
  )
  foreach ($requiredFile in $requiredFiles) {
    if (-not (Test-Path -LiteralPath $requiredFile)) {
      throw "Missing required release input: $requiredFile"
    }
  }

  Write-Host 'Release candidate toolchain validation passed.'
  Write-Host "Companion version: $companionVersion"
  Write-Host "Firmware version: $firmwareVersion"
  Write-Host "Bundled firmware version: $bundledFirmwareVersion"
  Write-Host "Output root: $OutputRoot"
  return
}

$buildStartedAt = Get-Date

if (-not $SkipBuild) {
  Invoke-Step 'Configure firmware release build' {
    Push-Location $repoRoot
    try {
      Invoke-Native 'Firmware configure' {
        cmake -S $repoRoot -B $firmwareBuildDir `
          "-DCMAKE_BUILD_TYPE=$Configuration" `
          "-DENABLE_COMPANION=ON" `
          "-DDS5_DIAGNOSTICS_PRESET=off" `
          "-DENABLE_DEBUG_LOGS=OFF" `
          "-DENABLE_AUDIO_DEBUG_REPORTS=OFF" `
          "-DENABLE_TRIGGER_TRACE_REPORTS=OFF" `
          "-DENABLE_FEEDBACK_TRACE_REPORTS=OFF"
      }
    } finally {
      Pop-Location
    }
  }

  Invoke-Step 'Build firmware UF2' {
    Push-Location $repoRoot
    try {
      Invoke-Native 'Firmware build' {
        cmake --build $firmwareBuildDir --target ds5-bridge --config $Configuration
      }
    } finally {
      Pop-Location
    }
  }

  Invoke-Step 'Build portable companion package' {
    Push-Location $companionRoot
    try {
      Invoke-Native 'Portable companion package' {
        npm run package:win
      }
    } finally {
      Pop-Location
    }
  }

  Invoke-Step 'Build companion installer' {
    Push-Location $companionRoot
    try {
      Invoke-Native 'Companion installer' {
        npm run installer:win
      }
    } finally {
      Pop-Location
    }
  }
}

Invoke-Step 'Collect artifacts' {
  if (-not (Test-Path -LiteralPath $firmwareOutput)) {
    throw "Missing firmware output: $firmwareOutput"
  }

  $installer = Get-ChildItem -LiteralPath $installerDir -File -Filter '*.exe' |
    Where-Object { $_.Name -like 'DS5-Bridge-Companion-Setup-*' } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if (-not $installer) {
    throw "Missing companion installer in $installerDir"
  }

  $portable = Get-ChildItem -LiteralPath $portableArtifactsDir -Directory |
    Where-Object {
      $_.Name -like 'DS5 Bridge-win32-x64-*' -and ($SkipBuild -or $_.LastWriteTime -ge $buildStartedAt.AddMinutes(-1))
    } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if (-not $portable) {
    throw "Missing portable companion package in $portableArtifactsDir"
  }

  New-Item -ItemType Directory -Path $releaseDir | Out-Null

  $firmwareName = "DS5-Bridge-Firmware-v$firmwareVersion.uf2"
  $installerName = "DS5-Bridge-Companion-Setup-v$companionVersion.exe"
  $portableName = "DS5-Bridge-Companion-Portable-v$companionVersion-win32-x64"
  $portableDestination = Join-Path $releaseDir $portableName
  $portableZipDestination = Join-Path $releaseDir "$portableName.zip"

  Copy-Item -LiteralPath $firmwareOutput -Destination (Join-Path $releaseDir $firmwareName) -Force
  Copy-Item -LiteralPath $installer.FullName -Destination (Join-Path $releaseDir $installerName) -Force
  Copy-Item -LiteralPath (Join-Path $repoRoot 'LICENSE') -Destination (Join-Path $releaseDir 'LICENSE') -Force
  Copy-Item -LiteralPath (Join-Path $repoRoot 'NOTICE') -Destination (Join-Path $releaseDir 'NOTICE') -Force
  Write-SourceNotice (Join-Path $releaseDir 'SOURCE.txt')
  Copy-Directory $portable.FullName $portableDestination

  if (-not $NoZip) {
    Compress-Archive -LiteralPath $portableDestination -DestinationPath $portableZipDestination -Force
  }

  $manifest = [ordered]@{
    createdAt = (Get-Date).ToString('o')
    firmwareVersion = $firmwareVersion
    companionVersion = $companionVersion
    artifacts = @(
      $firmwareName,
      $installerName,
      $portableName
    )
  }
  foreach ($entry in (Get-SourceMetadata).GetEnumerator()) {
    $manifest[$entry.Key] = $entry.Value
  }
  if (-not $NoZip) {
    $manifest.artifacts += "$portableName.zip"
  }
  $manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $releaseDir 'manifest.json') -Encoding UTF8
}

Write-Host ""
Write-Host "Release candidate created:"
Write-Host $releaseDir
Get-ChildItem -LiteralPath $releaseDir | Select-Object Name,Length,LastWriteTime | Format-Table -AutoSize
