# Anime Local Manager V2.0.0 Beta stable - release gate and optional GitHub publication.
# By default this script ONLY checks the files. Add -Publier to publish the prerelease.
# Requires GitHub CLI (gh) authenticated to Gentil-Robot and a clean V2 on main.
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)] [string]$Installateur,
    [Parameter(Mandatory=$true)] [string]$RapportBuild,
    [switch]$Publier,
    [string]$Depot = 'Gentil-Robot/Anime-Local-Manager',
    [string]$Tag = 'v2.0.0-beta'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$source = Split-Path -Parent $MyInvocation.MyCommand.Path
$installerPath = (Resolve-Path -LiteralPath $Installateur).Path
$reportPath = (Resolve-Path -LiteralPath $RapportBuild).Path
$installerName = 'Anime-Local-Manager-2.0.0-Beta-Stable-Setup-x64.exe'
if ([IO.Path]::GetFileName($installerPath) -cne $installerName) { throw "Nom d'installateur inattendu : $installerPath" }
if ($Depot -cne 'Gentil-Robot/Anime-Local-Manager' -or $Tag -cne 'v2.0.0-beta') { throw 'Depot ou tag non autorise.' }
if (-not (Get-Command 'node' -ErrorAction SilentlyContinue)) { throw 'Node.js absent.' }
# Read-only verification works without GitHub CLI; gh is required only for -Publier.
if ($Publier -and -not (Get-Command 'gh' -ErrorAction SilentlyContinue)) { throw 'GitHub CLI (gh) absent. Installer gh avant -Publier.' }
$pkg = Get-Content -Raw -LiteralPath (Join-Path $source 'package.json') | ConvertFrom-Json
if ($pkg.version -ne '2.0.0' -or $pkg.devDependencies.electron -ne '45.2.1') { throw 'Sources V2 / Electron non conformes.' }
& node (Join-Path $source 'scripts/check-source-files.js')
if ($LASTEXITCODE -ne 0) { throw 'Sources non conformes au manifeste SHA-256.' }
& node (Join-Path $source 'scripts/audit-publication.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Audit de publication en echec.' }
$report = Get-Content -Raw -LiteralPath $reportPath | ConvertFrom-Json
if ($report.status -ne 'passed') { throw 'La compilation doit etre terminee avec status=passed (essai NSIS reel). Le statut passed-with-limitations ne suffit pas.' }
if ($report.smoke.installer.status -ne 'passed') { throw 'Le veritable installateur NSIS doit avoir ete teste sur une VM propre / runner jetable.' }
if ($report.smoke.installer.runtime.electron -ne '45.2.1') { throw 'La version Electron reelle de la VM ne correspond pas.' }
if (@($report.artifacts).Count -ne 1 -or $report.artifacts[0].target -ne 'nsis') { throw 'Rapport de livrable non conforme.' }
$actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $installerPath).Hash.ToLowerInvariant()
$expectedHash = [string]$report.artifacts[0].sha256
if ($actualHash -ne $expectedHash.ToLowerInvariant()) { throw "Installateur et rapport de tests incompatibles. EXE=$actualHash" }
$size = (Get-Item -LiteralPath $installerPath).Length
if ($size -ne [long]$report.artifacts[0].bytes) { throw 'Taille de l installateur differente du rapport de test.' }
Write-Host "OK : version $($pkg.version), Electron $($pkg.devDependencies.electron), NSIS teste, SHA-256 $actualHash"

if (-not $Publier) {
    Write-Host 'Audit local termine. Aucune publication effectuee.'
    Write-Host 'Publier uniquement lorsque la V2 figure sur GitHub main et que le site Vercel est separe.'
    return
}

# Protected release: an authenticated GitHub CLI is necessary; the secret is never logged.
& gh auth status 1>$null 2>$null
if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI non connecte : utiliser gh auth login localement.' }
$remoteJson = & gh api "repos/$Depot/contents/package.json?ref=main"
if ($LASTEXITCODE -ne 0) { throw 'Impossible de lire package.json depuis GitHub main.' }
$remote = ($remoteJson | Out-String) | ConvertFrom-Json
$remoteData = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([string]$remote.content)) | ConvertFrom-Json
if ($remoteData.version -ne '2.0.0' -or $remoteData.devDependencies.electron -ne '45.2.1') { throw 'GitHub main contient encore une ancienne version. Integrer d abord la branche de publication V2.' }
# Verify Git LFS manifest for the clip: do not release a repository without the original media.
$attributesUrl = "repos/$Depot/contents/.gitattributes?ref=main"
$attrsJSON = & gh api $attributesUrl
if ($LASTEXITCODE -ne 0) { throw 'Fichier .gitattributes introuvable sur main.' }
$attrsContent = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([string](($attrsJSON | Out-String) | ConvertFrom-Json).content))
if ($attrsContent -notmatch 'alm-clip-complet-1080p\.mp4\s+filter=lfs') { throw 'Git LFS du clip non configure sur main.' }
& gh release view $Tag --repo $Depot 1>$null 2>$null
if ($LASTEXITCODE -eq 0) { throw "Une release $Tag existe deja. Aucune publication ni remplacement automatique." }
$notes = Join-Path $source 'docs/RELEASE-NOTES-V2.0.0-BETA.md'
if (-not (Test-Path -LiteralPath $notes)) { throw 'Notes de version manquantes.' }
$shaFile = Join-Path (Split-Path -Parent $installerPath) ($installerName + '.sha256')
[IO.File]::WriteAllText($shaFile, "$actualHash  $installerName`n",[Text.Encoding]::ASCII)
& gh release create $Tag $installerPath $shaFile --repo $Depot --title 'Anime Local Manager V2.0.0 Beta stable' --notes-file $notes --prerelease --target main --latest=false
if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI a refuse la publication.' }
Write-Host "Release publiee : https://github.com/$Depot/releases/tag/$Tag"
