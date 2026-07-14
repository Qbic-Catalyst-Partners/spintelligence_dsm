param(
  [string]$EnvFile = ".env",
  [string]$OutputDir = ".",
  [switch]$SkipLocalBackup
)

$ErrorActionPreference = "Stop"

function Load-EnvFile {
  param([string]$Path)

  if (!(Test-Path $Path)) {
    throw "Env file not found: $Path"
  }

  Get-Content $Path | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -notmatch '^\s*([^=]+)=(.*)$') {
      return
    }

    $name = $matches[1].Trim()
    $value = $matches[2].Trim().Trim('"').Trim("'")
    [Environment]::SetEnvironmentVariable($name, $value, "Process")
  }
}

function Require-Command {
  param([string]$Name)

  if (!(Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name is required. Install PostgreSQL client tools and make sure $Name is in PATH."
  }
}

Load-EnvFile -Path $EnvFile

if (!$env:DATABASE_URL_SUPABASE) {
  throw "DATABASE_URL_SUPABASE is missing in $EnvFile"
}
if (!$env:DATABASE_URL_LOCAL) {
  throw "DATABASE_URL_LOCAL is missing in $EnvFile"
}

Require-Command "pg_dump"
Require-Command "pg_restore"
Require-Command "psql"

if (!(Test-Path $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$supabaseDump = Join-Path $OutputDir "supabase_to_postgres_$stamp.dump"
$localBackup = Join-Path $OutputDir "postgres_before_supabase_$stamp.dump"

$appSchemas = @(
  "public",
  "autoconer",
  "blowroom",
  "carding",
  "comber",
  "drawframe",
  "mixing",
  "rbac",
  "reports",
  "simplex",
  "spinning",
  "ticketing_system",
  "trials",
  "users",
  "wrapping"
)

if (!$SkipLocalBackup) {
  Write-Host "Creating PostgreSQL backup: $localBackup"
  pg_dump --format=custom --no-owner --no-privileges --file="$localBackup" "$env:DATABASE_URL_LOCAL"
}

Write-Host "Exporting Supabase app schemas: $supabaseDump"
$dumpArgs = @("--format=custom", "--no-owner", "--no-privileges", "--file=$supabaseDump")
foreach ($schema in $appSchemas) {
  $dumpArgs += "--schema=$schema"
}
$dumpArgs += $env:DATABASE_URL_SUPABASE
& pg_dump @dumpArgs

Write-Host "Ensuring public schema exists in PostgreSQL"
psql "$env:DATABASE_URL_LOCAL" -v ON_ERROR_STOP=1 -c "CREATE SCHEMA IF NOT EXISTS public;"

Write-Host "Restoring Supabase app schemas into PostgreSQL"
$restoreArgs = @("--clean", "--if-exists", "--no-owner", "--no-privileges", "--dbname=$env:DATABASE_URL_LOCAL")
foreach ($schema in $appSchemas) {
  $restoreArgs += "--schema=$schema"
}
$restoreArgs += $supabaseDump
& pg_restore @restoreArgs

Write-Host "Supabase to PostgreSQL sync complete."
Write-Host "Supabase dump: $supabaseDump"
if (!$SkipLocalBackup) {
  Write-Host "Pre-sync PostgreSQL backup: $localBackup"
}
