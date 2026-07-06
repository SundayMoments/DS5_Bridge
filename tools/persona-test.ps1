param(
    [ValidateSet('auto', 'ds4', 'xbox')]
    [string]$Persona = 'auto',

    [int]$TimeoutMs = 15000,

    [string]$Path = '',

    [switch]$SkipOutput,

    [switch]$Json
)

$ErrorActionPreference = 'Stop'
$project = Join-Path $PSScriptRoot 'persona-test\DS5Bridge.PersonaTester.csproj'
$arguments = @('--persona', $Persona, '--timeout-ms', "$TimeoutMs")

if ($Path) {
    $arguments += @('--path', $Path)
}

if ($SkipOutput) {
    $arguments += '--skip-output'
}

if ($Json) {
    $arguments += '--json'
}

dotnet run --project $project -- $arguments
exit $LASTEXITCODE
