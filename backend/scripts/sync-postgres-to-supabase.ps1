param(
  [string]$EnvFile = ".env",
  [string]$OutputDir = "database backups",
  [switch]$SkipSupabaseBackup,
  [switch]$DataOnly
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

function Resolve-PostgresCommand {
  param([string]$Name)

  $pgRoot = "C:\Program Files\PostgreSQL"
  if (Test-Path $pgRoot) {
    $candidate = Get-ChildItem $pgRoot -Directory |
      Where-Object { $_.Name -match '^\d+$' } |
      Sort-Object { [int]$_.Name } -Descending |
      ForEach-Object { Join-Path $_.FullName "bin\$Name.exe" } |
      Where-Object { Test-Path $_ } |
      Select-Object -First 1

    if ($candidate) {
      return $candidate
    }
  }

  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if (!$command) {
    throw "$Name is required. Install PostgreSQL client tools and make sure $Name is in PATH."
  }
  return $command.Source
}

function Invoke-Native {
  param(
    [string]$FilePath,
    [object[]]$Arguments
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath failed with exit code $LASTEXITCODE"
  }
}

Load-EnvFile -Path $EnvFile

if (!$env:DATABASE_URL_LOCAL) {
  throw "DATABASE_URL_LOCAL is missing in $EnvFile"
}
if (!$env:DATABASE_URL_SUPABASE) {
  throw "DATABASE_URL_SUPABASE is missing in $EnvFile"
}

$pgDump = Resolve-PostgresCommand "pg_dump"
$pgRestore = Resolve-PostgresCommand "pg_restore"
$psql = Resolve-PostgresCommand "psql"

if (!(Test-Path $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$dumpLabel = if ($DataOnly) { "postgres_data_to_supabase" } else { "postgres_to_supabase" }
$localDump = Join-Path $OutputDir "$dumpLabel`_$stamp.dump"
$supabaseBackup = Join-Path $OutputDir "supabase_before_postgres_$stamp.dump"

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

if (!$SkipSupabaseBackup) {
  Write-Host "Creating Supabase backup: $supabaseBackup"
  $backupArgs = @("--format=custom", "--no-owner", "--no-privileges", "--file=$supabaseBackup")
  foreach ($schema in $appSchemas) {
    $backupArgs += "--schema=$schema"
  }
  $backupArgs += $env:DATABASE_URL_SUPABASE
  Invoke-Native $pgDump $backupArgs
}

Write-Host "Exporting PostgreSQL app schemas: $localDump"
$dumpArgs = @("--format=custom", "--no-owner", "--no-privileges", "--file=$localDump")
if ($DataOnly) {
  $dumpArgs += "--data-only"
}
foreach ($schema in $appSchemas) {
  $dumpArgs += "--schema=$schema"
}
$dumpArgs += $env:DATABASE_URL_LOCAL
Invoke-Native $pgDump $dumpArgs

Write-Host "Ensuring public schema exists in Supabase"
Invoke-Native $psql @("$env:DATABASE_URL_SUPABASE", "-v", "ON_ERROR_STOP=1", "-c", "CREATE SCHEMA IF NOT EXISTS public;")

if ($DataOnly) {
  Write-Host "Truncating Supabase app-schema tables before data restore"
  $schemasSql = ($appSchemas | ForEach-Object { "'$($_.Replace("'", "''"))'" }) -join ","
  $truncateSql = @"
DO `$`$
DECLARE
  stmt text;
BEGIN
  SELECT 'TRUNCATE TABLE ' || string_agg(format('%I.%I', schemaname, tablename), ', ') || ' RESTART IDENTITY CASCADE'
    INTO stmt
  FROM pg_tables
  WHERE schemaname IN ($schemasSql);

  IF stmt IS NOT NULL THEN
    EXECUTE stmt;
  END IF;
END
`$`$;
"@
  Invoke-Native $psql @("$env:DATABASE_URL_SUPABASE", "-v", "ON_ERROR_STOP=1", "-c", $truncateSql)
} else {
  Write-Host "Dropping Supabase app schemas before full restore"
  foreach ($schema in $appSchemas) {
    if ($schema -eq "public") {
      Invoke-Native $psql @("$env:DATABASE_URL_SUPABASE", "-v", "ON_ERROR_STOP=1", "-c", "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;")
    } else {
      Invoke-Native $psql @("$env:DATABASE_URL_SUPABASE", "-v", "ON_ERROR_STOP=1", "-c", "DROP SCHEMA IF EXISTS ""$schema"" CASCADE; CREATE SCHEMA ""$schema"";")
    }
  }
}

Write-Host "Restoring PostgreSQL app schemas into Supabase"
$restoreArgs = @("--single-transaction", "--no-owner", "--no-privileges", "--dbname=$env:DATABASE_URL_SUPABASE")
if ($DataOnly) {
  $restoreArgs += "--data-only"
}
foreach ($schema in $appSchemas) {
  $restoreArgs += "--schema=$schema"
}
$restoreArgs += $localDump
Invoke-Native $pgRestore $restoreArgs

Write-Host "PostgreSQL to Supabase sync complete."
Write-Host "PostgreSQL dump: $localDump"
if (!$SkipSupabaseBackup) {
  Write-Host "Pre-sync Supabase backup: $supabaseBackup"
}
