# Anime Local Manager V2.1.1 Beta stable - release gate and optional GitHub publication.
# By default this script ONLY checks the files. Add -Publier to publish the prerelease.
# Requires GitHub CLI (gh) authenticated to Gentil-Robot and a matching source ref.
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)] [string]$Installateur,
    [Parameter(Mandatory=$true)] [string]$RapportBuild,
    [switch]$Publier,
    [string]$Depot = 'Gentil-Robot/Anime-Local-Manager',
    [string]$Tag = 'v2.1.1',
    [string]$Ref = 'release/v2.1.1'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$source = Split-Path -Parent $MyInvocation.MyCommand.Path
$installerPath = (Resolve-Path -LiteralPath $Installateur).Path
$reportPath = (Resolve-Path -LiteralPath $RapportBuild).Path
$release = Get-Content -Raw -LiteralPath (Join-Path $source 'release-version.json') | ConvertFrom-Json
$installerName = [string]$release.installerName
if ([IO.Path]::GetFileName($installerPath) -cne $installerName) { throw "Nom d'installateur inattendu : $installerPath" }
if ($Depot -cne 'Gentil-Robot/Anime-Local-Manager' -or $Tag -cne ('v' + $release.technicalVersion) -or $Ref -notmatch '^(main|release/v[0-9]+\.[0-9]+\.[0-9]+)$') { throw 'Depot ou tag non autorise.' }
if (-not (Get-Command 'node' -ErrorAction SilentlyContinue)) { throw 'Node.js absent.' }
# Read-only verification works without GitHub CLI; gh is required only for -Publier.
if ($Publier -and -not (Get-Command 'gh' -ErrorAction SilentlyContinue)) { throw 'GitHub CLI (gh) absent. Installer gh avant -Publier.' }
$pkg = Get-Content -Raw -LiteralPath (Join-Path $source 'package.json') | ConvertFrom-Json
if ($pkg.version -ne $release.technicalVersion -or $pkg.devDependencies.electron -ne '45.3.1') { throw 'Sources V2 / Electron non conformes.' }
& node (Join-Path $source 'scripts/check-source-files.js')
if ($LASTEXITCODE -ne 0) { throw 'Sources non conformes au manifeste SHA-256.' }
& node (Join-Path $source 'scripts/audit-publication.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Audit de publication en echec.' }
$report = Get-Content -Raw -LiteralPath $reportPath | ConvertFrom-Json
if ($report.version -ne $release.technicalVersion) { throw 'Version du rapport incompatible.' }
$manifestPath = Join-Path $source 'SOURCE-MANIFEST.json'
$manifestHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $manifestPath).Hash.ToLowerInvariant()
if ($report.source.manifestSha256 -ne $manifestHash) { throw 'Le rapport ne correspond pas aux sources courantes.' }
if ($report.status -ne 'passed') { throw 'La compilation doit etre terminee avec status=passed (essai NSIS reel). Le statut passed-with-limitations ne suffit pas.' }
if ($report.smoke.installer.status -ne 'passed') { throw 'Le veritable installateur NSIS doit avoir ete teste sur une VM propre / runner jetable.' }
if ($report.smoke.installer.runtime.electron -ne '45.3.1') { throw 'La version Electron reelle de la VM ne correspond pas.' }
if (@($report.artifacts).Count -ne 1 -or $report.artifacts[0].target -ne 'nsis') { throw 'Rapport de livrable non conforme.' }
$actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $installerPath).Hash.ToLowerInvariant()
$expectedHash = [string]$report.artifacts[0].sha256
if ($actualHash -ne $expectedHash.ToLowerInvariant()) { throw "Installateur et rapport de tests incompatibles. EXE=$actualHash" }
$size = (Get-Item -LiteralPath $installerPath).Length
if ($size -ne [long]$report.artifacts[0].bytes) { throw 'Taille de l installateur differente du rapport de test.' }
Write-Host "OK : version $($pkg.version), Electron $($pkg.devDependencies.electron), NSIS teste, SHA-256 $actualHash"

if (-not $Publier) {
    Write-Host 'Audit local termine. Aucune publication effectuee.'
    Write-Host 'Publier uniquement depuis les sources et le rapport Windows verifiés.'
    return
}

# Protected release: an authenticated GitHub CLI is necessary; the secret is never logged.
& gh auth status 1>$null 2>$null
if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI non connecte : utiliser gh auth login localement.' }
$remoteJson = & gh api "repos/$Depot/contents/package.json?ref=$Ref"
if ($LASTEXITCODE -ne 0) { throw 'Impossible de lire package.json depuis La reference GitHub selectionnee.' }
$remote = ($remoteJson | Out-String) | ConvertFrom-Json
$remoteData = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([string]$remote.content)) | ConvertFrom-Json
if ($remoteData.version -ne $release.technicalVersion -or $remoteData.devDependencies.electron -ne '45.3.1') { throw 'La reference GitHub selectionnee contient encore une ancienne version. Integrer d abord la branche de publication V2.' }
# Resolve the chosen immutable commit and match its exact source manifest.
$commitSha = & gh api "repos/$Depot/commits/$Ref" --jq '.sha'
if ($LASTEXITCODE -ne 0 -or $commitSha -notmatch '^[a-f0-9]{40}$') { throw 'Commit distant non resolu.' }
$remoteManifest = & gh api "repos/$Depot/contents/SOURCE-MANIFEST.json?ref=$commitSha" --jq '.content'
if ($LASTEXITCODE -ne 0) { throw 'Manifeste distant introuvable.' }
$remoteBytes = [Convert]::FromBase64String(($remoteManifest | Out-String))
$sha = [Security.Cryptography.SHA256]::Create()
try { $remoteDigest = [BitConverter]::ToString($sha.ComputeHash($remoteBytes)).Replace('-', '').ToLowerInvariant() } finally { $sha.Dispose() }
if ($remoteDigest -ne $manifestHash) { throw 'Sources distantes differentes des sources testees.' }
# Verify Git LFS manifest for the clip: do not release a repository without the original media.
$attributesUrl = "repos/$Depot/contents/.gitattributes?ref=$Ref"
$attrsJSON = & gh api $attributesUrl
if ($LASTEXITCODE -ne 0) { throw 'Fichier .gitattributes introuvable sur la reference selectionnee.' }
$attrsContent = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([string](($attrsJSON | Out-String) | ConvertFrom-Json).content))
if ($attrsContent -notmatch 'alm-clip-complet-1080p\.mp4\s+filter=lfs') { throw 'Git LFS du clip non configure sur la reference selectionnee.' }
& gh release view $Tag --repo $Depot 1>$null 2>$null
if ($LASTEXITCODE -eq 0) { throw "Une release $Tag existe deja. Aucune publication ni remplacement automatique." }
$notes = Join-Path $source 'docs/RELEASE-NOTES-V2.1.1.md'
if (-not (Test-Path -LiteralPath $notes)) { throw 'Notes de version manquantes.' }
$shaFile = Join-Path (Split-Path -Parent $installerPath) 'SHA256SUMS.txt'
[IO.File]::WriteAllText($shaFile, "$actualHash  $installerName`n",[Text.Encoding]::ASCII)
& gh release create $Tag $installerPath $reportPath $shaFile --repo $Depot --title $release.publicName --notes-file $notes --prerelease --target $commitSha --draft
if ($LASTEXITCODE -ne 0) { throw 'Creation du brouillon refusee.' }
& gh release edit $Tag --repo $Depot --draft=false --prerelease --latest=false
if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI a refuse la publication.' }
Write-Host "Release publiee : https://github.com/$Depot/releases/tag/$Tag"
