# Uploads all SNOMED pathology supplement CodeSystems in this folder to an
# Ontoserver R4 endpoint. Re-run after editing the local JSON to push updates.
#
# Before uploading, the script auto-detects the server's active SNOMED AU edition
# and patches two fields in each file (in-place on disk and in the upload payload):
#
#   "version":     "1.20260331.0"  ->  "1.20260430.0"  (edition changed: resets patch to 0)
#   "version":     "1.20260430.1"  ->  "1.20260430.1"  (edition unchanged: patch preserved)
#   "supplements": "...version/20260331"  ->  "...version/20260430"
#
# The script exits without uploading if all local supplement versions already match
# what is on the server. To force an upload after local edits, increment the patch
# component of the version field (e.g. 1.20260430.0 -> 1.20260430.1).
#
# Usage:
#   .\upload-supplements.ps1                          # PUT all supplement-*.json files
#   .\upload-supplements.ps1 -Server https://host/fhir
#   .\upload-supplements.ps1 -Pattern 'snomed-pathology-test-info-supplement-bb*.json'
#   .\upload-supplements.ps1 -DryRun                  # show patches + what would be sent, don't PUT

[CmdletBinding()]
param(
    [string]$Server  = "https://r4.ontoserver.csiro.au/fhir",
    [string]$Pattern = "snomed-pathology-test-info-supplement*.json",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# ----- Detect active SNOMED AU edition from server -----
Write-Host "Server: $Server"
Write-Host "Detecting active SNOMED AU edition..."
$snomedEdition = $null
$editionDate   = $null
try {
    $pingUrl = $Server + "/ValueSet/`$expand?url=http://snomed.info/sct?fhir_vs&count=1&filter=glucose"
    $ping = Invoke-RestMethod -Uri $pingUrl -Headers @{Accept="application/fhir+json"}
    $usedCs = $ping.expansion.parameter | Where-Object { $_.name -eq 'used-codesystem' } | Select-Object -First 1
    if ($usedCs -and $usedCs.valueUri -match 'http://snomed\.info/sct\|(.+)') {
        $snomedEdition = $matches[1]
    }
    if ($snomedEdition -match '(\d{8})$') {
        $editionDate = $matches[1]
    }
} catch {}

if ($editionDate) {
    Write-Host "  Active edition: $snomedEdition (date: $editionDate)" -ForegroundColor Cyan
} else {
    Write-Host "  WARNING: Could not detect active SNOMED edition - aborting" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# ----- Find files -----
$files = Get-ChildItem -Path $scriptDir -Filter $Pattern -File

if (-not $files) {
    Write-Host "No files matching '$Pattern' found in $scriptDir" -ForegroundColor Yellow
    exit 1
}

# ----- Check if any file actually needs updating -----
$needsUpdate = $false
foreach ($f in $files) {
    $parsed = (Get-Content $f.FullName -Raw -Encoding UTF8) | ConvertFrom-Json
    if ($parsed.content -eq 'supplement') {
        # Edition date changed
        if ($parsed.supplements -match '/version/(\d{8})$' -and $matches[1] -ne $editionDate) {
            $needsUpdate = $true; break
        }
        # Local version differs from what's on the server (e.g. user bumped patch)
        try {
            $existing = Invoke-RestMethod -Uri ($Server + "/CodeSystem/" + $parsed.id) -Headers @{Accept="application/fhir+json"}
            if ($existing.version -ne $parsed.version) {
                Write-Host "  $($f.Name): local $($parsed.version) != server $($existing.version)" -ForegroundColor Cyan
                $needsUpdate = $true; break
            }
        } catch {
            $needsUpdate = $true; break  # resource not on server yet
        }
    }
}

if (-not $needsUpdate) {
    Write-Host "Supplements are already at edition $editionDate with no version changes — nothing to do." -ForegroundColor Green
    exit 0
}

Write-Host "Found $($files.Count) file(s) matching '$Pattern'"
Write-Host ""

$ok = 0
$fail = 0

foreach ($f in $files) {
    $json = Get-Content $f.FullName -Raw -Encoding UTF8
    try {
        $parsed = $json | ConvertFrom-Json
    } catch {
        Write-Host "SKIP $($f.Name) - invalid JSON: $($_.Exception.Message)" -ForegroundColor Red
        $fail++
        continue
    }

    if ($parsed.resourceType -ne "CodeSystem") {
        Write-Host "SKIP $($f.Name) - resourceType '$($parsed.resourceType)' is not CodeSystem" -ForegroundColor Yellow
        continue
    }
    if (-not $parsed.id) {
        Write-Host "SKIP $($f.Name) - missing 'id' field (needed for PUT)" -ForegroundColor Yellow
        continue
    }

    # ----- Patch version and supplements fields -----
    $changed = $false
    if ($parsed.content -eq 'supplement') {

        # 1. version: reset patch to 0 when edition changes; preserve patch when edition is already current
        $oldVersion = $parsed.version
        if ($oldVersion -match '^1\.(\d{8})\.\d+$' -and $matches[1] -eq $editionDate) {
            $newVersion = $oldVersion
        } else {
            $newVersion = "1." + $editionDate + ".0"
        }
        if ($oldVersion -ne $newVersion) {
            $json = $json.Replace('"version": "' + $oldVersion + '"', '"version": "' + $newVersion + '"')
            Write-Host "    version:     $oldVersion -> $newVersion" -ForegroundColor DarkGray
            $changed = $true
        }

        # 2. supplements: replace just the date portion (last 8 digits)
        $oldSupplements = $parsed.supplements
        if ($oldSupplements -match '^(.+/version/)\d{8}$') {
            $newSupplements = $matches[1] + $editionDate
        } else {
            $newSupplements = $oldSupplements
        }
        if ($oldSupplements -ne $newSupplements) {
            $json = $json.Replace('"supplements": "' + $oldSupplements + '"', '"supplements": "' + $newSupplements + '"')
            Write-Host "    supplements: $oldSupplements" -ForegroundColor DarkGray
            Write-Host "             -> $newSupplements" -ForegroundColor DarkGray
            $changed = $true
        }

        # Write patched JSON back to disk so the local file stays in sync
        if ($changed -and -not $DryRun) {
            $json | Set-Content $f.FullName -Encoding UTF8 -NoNewline
        }
    }

    $putUrl = $Server + "/CodeSystem/" + $parsed.id
    Write-Host "PUT $putUrl"
    Write-Host "    file:    $($f.Name)"
    Write-Host "    url:     $($parsed.url)"
    Write-Host "    version: $((($json | ConvertFrom-Json).version))"

    if ($DryRun) {
        Write-Host "    (dry run - not sending)" -ForegroundColor Cyan
        Write-Host ""
        continue
    }

    try {
        $resp = Invoke-RestMethod -Method Put -Uri $putUrl -Body $json -ContentType "application/fhir+json"
        Write-Host "    OK: $($resp.resourceType)/$($resp.id) v$($resp.version) status=$($resp.status)" -ForegroundColor Green
        $ok++
    } catch {
        Write-Host "    ERROR: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.Exception.Response) {
            try {
                $stream = $_.Exception.Response.GetResponseStream()
                $reader = New-Object System.IO.StreamReader($stream)
                $body = $reader.ReadToEnd()
                if ($body) { Write-Host "    Response: $body" -ForegroundColor Red }
            } catch {}
        }
        $fail++
    }
    Write-Host ""
}

if (-not $DryRun) {
    Write-Host "---"
    Write-Host "Uploaded: $ok   Failed: $fail"
    if ($fail -gt 0) { exit 1 }
}
