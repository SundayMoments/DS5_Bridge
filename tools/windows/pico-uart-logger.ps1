<#
.SYNOPSIS
  Captures DS5 Bridge Pico firmware logs from a physical USB-to-UART adapter.

.DESCRIPTION
  The capture action auto-detects the project's CH343 adapter, records the raw
  UART stream in rotating files under LocalAppData, and reconnects when either
  the adapter or Pico is unplugged. The install action registers a per-user
  scheduled task so capture resumes at sign-in without an open terminal.

.EXAMPLE
  .\tools\windows\pico-uart-logger.ps1 capture

.EXAMPLE
  .\tools\windows\pico-uart-logger.ps1 install

.EXAMPLE
  .\tools\windows\pico-uart-logger.ps1 status
#>

[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [ValidateSet('capture', 'install', 'start', 'stop', 'status', 'uninstall')]
  [string] $Action = 'status',

  [ValidatePattern('^$|^COM\d+$')]
  [string] $PortName = '',

  [ValidateRange(1200, 4000000)]
  [int] $BaudRate = 921600,

  [string] $LogRoot = '',

  [ValidateRange(1, 3650)]
  [int] $RetentionDays = 30,

  [ValidateRange(1048576, 1099511627776)]
  [long] $MaxLogBytes = 536870912,

  [ValidateRange(1048576, 1073741824)]
  [long] $MaxFileBytes = 33554432,

  [ValidateRange(1, 300)]
  [int] $ReconnectDelaySeconds = 2,

  [ValidateRange(0, 86400)]
  [int] $StopAfterSeconds = 0,

  [switch] $NoConsoleEcho
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$taskName = 'DS5 Bridge Pico UART Logger'
$adapterInstancePattern = 'VID_1A86&PID_55D3'
$productRoot = Join-Path $env:LOCALAPPDATA 'DS5 Bridge'
$installRoot = Join-Path $productRoot 'tools'
$installedScriptPath = Join-Path $installRoot 'pico-uart-logger.ps1'
if ([string]::IsNullOrWhiteSpace($LogRoot)) {
  $LogRoot = Join-Path $productRoot 'logs\pico-uart'
}
$LogRoot = [System.IO.Path]::GetFullPath($LogRoot)
$statusPath = Join-Path $LogRoot 'status.json'

function Get-LoggerTask {
  return Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
}

function Get-LoggerStatus {
  $task = Get-LoggerTask
  $runtime = $null
  if (Test-Path -LiteralPath $statusPath -PathType Leaf) {
    try {
      $runtime = Get-Content -Raw -LiteralPath $statusPath | ConvertFrom-Json
    }
    catch {
      $runtime = [pscustomobject]@{
        running = $false
        lastError = "Unable to parse status file: $($_.Exception.Message)"
      }
    }
  }

  $processAlive = $false
  $runtimeDeclaredRunning = $null -ne $runtime `
    -and $null -ne $runtime.PSObject.Properties['running'] `
    -and [bool] $runtime.running
  if ($runtimeDeclaredRunning -and $null -ne $runtime.PSObject.Properties['pid']) {
    $processAlive = $null -ne (Get-Process -Id ([int] $runtime.pid) -ErrorAction SilentlyContinue)
  }

  [pscustomobject]@{
    TaskInstalled = $null -ne $task
    TaskState = if ($null -ne $task) { [string] $task.State } else { 'NotInstalled' }
    ProcessAlive = $processAlive
    Connected = if ($processAlive -and $null -ne $runtime.PSObject.Properties['connected']) { [bool] $runtime.connected } else { $false }
    Port = if ($null -ne $runtime -and $null -ne $runtime.PSObject.Properties['port']) { [string] $runtime.port } else { '' }
    BaudRate = if ($null -ne $runtime -and $null -ne $runtime.PSObject.Properties['baudRate']) { [int] $runtime.baudRate } else { $BaudRate }
    CapturedBytes = if ($null -ne $runtime -and $null -ne $runtime.PSObject.Properties['capturedBytes']) { [long] $runtime.capturedBytes } else { 0 }
    LastByteAt = if ($null -ne $runtime -and $null -ne $runtime.PSObject.Properties['lastByteAt']) { [string] $runtime.lastByteAt } else { '' }
    CurrentLog = if ($null -ne $runtime -and $null -ne $runtime.PSObject.Properties['currentLog']) { [string] $runtime.currentLog } else { '' }
    LastError = if ($null -ne $runtime -and $null -ne $runtime.PSObject.Properties['lastError']) { [string] $runtime.lastError } else { '' }
    LogRoot = $LogRoot
  }
}

function Install-LoggerTask {
  New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $LogRoot -Force | Out-Null

  $existingTask = Get-LoggerTask
  if ($null -ne $existingTask) {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 250
  }

  $sourcePath = [System.IO.Path]::GetFullPath($PSCommandPath)
  if (-not $sourcePath.Equals($installedScriptPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    Copy-Item -LiteralPath $sourcePath -Destination $installedScriptPath -Force
  }

  $taskArguments = @(
    '-NoProfile'
    '-ExecutionPolicy Bypass'
    '-WindowStyle Hidden'
    "-File `"$installedScriptPath`""
    'capture'
    "-BaudRate $BaudRate"
    "-LogRoot `"$LogRoot`""
    "-RetentionDays $RetentionDays"
    "-MaxLogBytes $MaxLogBytes"
    "-MaxFileBytes $MaxFileBytes"
    "-ReconnectDelaySeconds $ReconnectDelaySeconds"
    '-NoConsoleEcho'
  )
  if (-not [string]::IsNullOrWhiteSpace($PortName)) {
    $taskArguments += "-PortName $($PortName.ToUpperInvariant())"
  }

  $powerShellPath = Join-Path $PSHOME 'powershell.exe'
  $taskAction = New-ScheduledTaskAction `
    -Execute $powerShellPath `
    -Argument ($taskArguments -join ' ') `
    -WorkingDirectory $installRoot
  $principalId = if ([string]::IsNullOrWhiteSpace($env:USERDOMAIN)) {
    $env:USERNAME
  } else {
    "$env:USERDOMAIN\$env:USERNAME"
  }
  $taskTrigger = New-ScheduledTaskTrigger -AtLogOn -User $principalId
  $taskPrincipal = New-ScheduledTaskPrincipal `
    -UserId $principalId `
    -LogonType Interactive `
    -RunLevel Limited
  $taskSettings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero)

  Register-ScheduledTask `
    -TaskName $taskName `
    -Action $taskAction `
    -Trigger $taskTrigger `
    -Principal $taskPrincipal `
    -Settings $taskSettings `
    -Description 'Persistently captures DS5 Bridge Pico firmware UART logs.' `
    -Force | Out-Null

  Start-ScheduledTask -TaskName $taskName
  Write-Host "Installed and started scheduled task: $taskName"
  Write-Host "Logs: $LogRoot"
}

function Start-LoggerTask {
  if ($null -eq (Get-LoggerTask)) {
    throw "Scheduled task is not installed. Run: $PSCommandPath install"
  }
  Start-ScheduledTask -TaskName $taskName
  Write-Host "Started scheduled task: $taskName"
}

function Stop-LoggerTask {
  if ($null -eq (Get-LoggerTask)) {
    Write-Host "Scheduled task is not installed: $taskName"
    return
  }
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  Write-Host "Stopped scheduled task: $taskName"
}

function Uninstall-LoggerTask {
  $task = Get-LoggerTask
  if ($null -eq $task) {
    Write-Host "Scheduled task is not installed: $taskName"
    return
  }
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  Write-Host "Uninstalled scheduled task: $taskName"
  Write-Host "Existing logs were preserved at: $LogRoot"
}

function Resolve-UartPort {
  if (-not [string]::IsNullOrWhiteSpace($PortName)) {
    return $PortName.ToUpperInvariant()
  }

  $matches = @()
  if ($null -ne (Get-Command Get-PnpDevice -ErrorAction SilentlyContinue)) {
    $matches = @(Get-PnpDevice -PresentOnly -Class Ports -ErrorAction SilentlyContinue | Where-Object {
      $_.InstanceId -match [regex]::Escape($adapterInstancePattern) -and
      $_.FriendlyName -match '\((COM\d+)\)'
    })
  }

  if ($matches.Count -gt 1) {
    $names = ($matches | ForEach-Object { $_.FriendlyName }) -join ', '
    throw "Multiple CH343 adapters are present ($names). Pass -PortName explicitly."
  }
  if ($matches.Count -eq 1 -and $matches[0].FriendlyName -match '\((COM\d+)\)') {
    return $Matches[1].ToUpperInvariant()
  }
  return $null
}

function Invoke-LogRetention([string] $ExcludedPath = '') {
  if (-not (Test-Path -LiteralPath $LogRoot -PathType Container)) {
    return
  }

  $cutoff = [DateTime]::UtcNow.AddDays(-$RetentionDays)
  $logs = @(Get-ChildItem -LiteralPath $LogRoot -Filter 'pico-uart-*.log' -File -ErrorAction SilentlyContinue)
  foreach ($log in $logs) {
    if (-not $log.FullName.Equals($ExcludedPath, [System.StringComparison]::OrdinalIgnoreCase) -and $log.LastWriteTimeUtc -lt $cutoff) {
      Remove-Item -LiteralPath $log.FullName -Force -ErrorAction SilentlyContinue
    }
  }

  $logs = @(Get-ChildItem -LiteralPath $LogRoot -Filter 'pico-uart-*.log' -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTimeUtc -Descending)
  [long] $retainedBytes = 0
  foreach ($log in $logs) {
    $retainedBytes += $log.Length
    if ($retainedBytes -gt $MaxLogBytes -and -not $log.FullName.Equals($ExcludedPath, [System.StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $log.FullName -Force -ErrorAction SilentlyContinue
    }
  }
}

function Start-UartCapture {
  New-Item -ItemType Directory -Path $LogRoot -Force | Out-Null

  $createdNew = $false
  $mutex = [System.Threading.Mutex]::new($true, 'Local\DS5BridgePicoUartLogger', [ref] $createdNew)
  if (-not $createdNew) {
    $mutex.Dispose()
    throw 'Another DS5 Bridge Pico UART logger is already running.'
  }

  $startedAt = [DateTime]::UtcNow
  $deadline = if ($StopAfterSeconds -gt 0) { $startedAt.AddSeconds($StopAfterSeconds) } else { [DateTime]::MaxValue }
  $sessionStem = "pico-uart-$($startedAt.ToString('yyyyMMdd-HHmmss'))-$PID"
  $state = @{
    RotationIndex = 0
    Stream = $null
    CurrentLogPath = ''
    CapturedBytes = [long] 0
    LastByteAt = ''
    LastError = ''
    ConnectedPort = ''
  }
  $serial = $null
  $lastFlushAt = [DateTime]::UtcNow
  $lastStatusAt = [DateTime]::MinValue
  $lastRetentionAt = [DateTime]::MinValue
  $readBuffer = New-Object byte[] 16384

  function Open-LogStream {
    if ($null -ne $state.Stream) {
      $state.Stream.Flush()
      $state.Stream.Dispose()
    }
    $suffix = if ($state.RotationIndex -eq 0) { '' } else { "-$($state.RotationIndex.ToString('D3'))" }
    $state.CurrentLogPath = Join-Path $LogRoot "$sessionStem$suffix.log"
    $state.RotationIndex++
    $state.Stream = [System.IO.FileStream]::new(
      $state.CurrentLogPath,
      [System.IO.FileMode]::CreateNew,
      [System.IO.FileAccess]::Write,
      [System.IO.FileShare]::ReadWrite,
      65536,
      [System.IO.FileOptions]::SequentialScan
    )
  }

  function Write-Bytes([byte[]] $Bytes, [int] $Count) {
    if ($Count -le 0) {
      return
    }
    if ($null -eq $state.Stream -or ($state.Stream.Length + $Count) -gt $MaxFileBytes) {
      Open-LogStream
    }
    $state.Stream.Write($Bytes, 0, $Count)
  }

  function Write-Marker([string] $Message) {
    $line = "`r`n# [host $([DateTime]::UtcNow.ToString('o'))] $Message`r`n"
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($line)
    Write-Bytes $bytes $bytes.Length
    if (-not $NoConsoleEcho) {
      Write-Host $line.Trim()
    }
  }

  function Write-Status([bool] $Connected, [bool] $Running) {
    $status = [ordered]@{
      running = $Running
      connected = $Connected
      pid = $PID
      port = $state.ConnectedPort
      baudRate = $BaudRate
      startedAt = $startedAt.ToString('o')
      updatedAt = [DateTime]::UtcNow.ToString('o')
      lastByteAt = $state.LastByteAt
      capturedBytes = $state.CapturedBytes
      currentLog = $state.CurrentLogPath
      lastError = $state.LastError
    }
    $json = $status | ConvertTo-Json
    $temporaryPath = "$statusPath.$PID.tmp"
    [System.IO.File]::WriteAllText($temporaryPath, $json, [System.Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temporaryPath -Destination $statusPath -Force
  }

  try {
    Invoke-LogRetention
    Open-LogStream
    Write-Marker "logger-start baud=$BaudRate adapter=$adapterInstancePattern"
    Write-Status $false $true

    $shouldStop = $false
    while (-not $shouldStop) {
      if ([DateTime]::UtcNow -ge $deadline) {
        break
      }

      try {
        $resolvedPort = Resolve-UartPort
        if ([string]::IsNullOrWhiteSpace($resolvedPort)) {
          $state.LastError = 'CH343 adapter is not currently present.'
          $state.ConnectedPort = ''
          Write-Status $false $true
          Start-Sleep -Seconds $ReconnectDelaySeconds
          continue
        }

        $state.ConnectedPort = $resolvedPort
        $serial = [System.IO.Ports.SerialPort]::new(
          $resolvedPort,
          $BaudRate,
          [System.IO.Ports.Parity]::None,
          8,
          [System.IO.Ports.StopBits]::One
        )
        $serial.Handshake = [System.IO.Ports.Handshake]::None
        $serial.DtrEnable = $false
        $serial.RtsEnable = $false
        $serial.ReadTimeout = 250
        $serial.WriteTimeout = 250
        $serial.Open()
        $state.LastError = ''
        Write-Marker "connected port=$resolvedPort baud=$BaudRate data=8 parity=none stop=1 flow=none"
        Write-Status $true $true

        while ($serial.IsOpen) {
          $now = [DateTime]::UtcNow
          if ($now -ge $deadline) {
            $shouldStop = $true
            break
          }

          $available = $serial.BytesToRead
          if ($available -gt 0) {
            $count = $serial.Read($readBuffer, 0, [Math]::Min($readBuffer.Length, $available))
            if ($count -gt 0) {
              Write-Bytes $readBuffer $count
              $state.CapturedBytes += $count
              $state.LastByteAt = $now.ToString('o')
              if (-not $NoConsoleEcho) {
                [Console]::OpenStandardOutput().Write($readBuffer, 0, $count)
              }
            }
          } else {
            Start-Sleep -Milliseconds 20
          }

          if (($now - $lastFlushAt).TotalSeconds -ge 1) {
            $state.Stream.Flush()
            $lastFlushAt = $now
          }
          if (($now - $lastStatusAt).TotalSeconds -ge 5) {
            Write-Status $true $true
            $lastStatusAt = $now
          }
          if (($now - $lastRetentionAt).TotalHours -ge 1) {
            Invoke-LogRetention $state.CurrentLogPath
            $lastRetentionAt = $now
          }
        }
      }
      catch {
        $state.LastError = $_.Exception.Message
        Write-Marker "disconnected port=$($state.ConnectedPort) error=$($state.LastError)"
        Write-Status $false $true
      }
      finally {
        if ($null -ne $serial) {
          if ($serial.IsOpen) {
            $serial.Close()
          }
          $serial.Dispose()
          $serial = $null
        }
      }

      if (-not $shouldStop) {
        Start-Sleep -Seconds $ReconnectDelaySeconds
      }
    }
  }
  finally {
    if ($null -ne $serial) {
      if ($serial.IsOpen) {
        $serial.Close()
      }
      $serial.Dispose()
    }
    if ($null -ne $state.Stream) {
      Write-Marker 'logger-stop'
      $state.Stream.Flush()
      $state.Stream.Dispose()
      $state.Stream = $null
    }
    Write-Status $false $false
    $mutex.ReleaseMutex()
    $mutex.Dispose()
  }
}

switch ($Action) {
  'capture' {
    Start-UartCapture
  }
  'install' {
    Install-LoggerTask
  }
  'start' {
    Start-LoggerTask
  }
  'stop' {
    Stop-LoggerTask
  }
  'status' {
    Get-LoggerStatus | Format-List
  }
  'uninstall' {
    Uninstall-LoggerTask
  }
}
