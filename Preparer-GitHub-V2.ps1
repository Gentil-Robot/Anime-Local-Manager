# Requires Git for Windows, Git LFS and Node.js 22.23.4.
# First run (no parameters): create a LOCAL branch + commit. NO remote write.
# Second run with -PublierBranche -RepertoireTravail <clone>: push branch,
# optionally create a DRAFT PR using GitHub CLI. NEVER merges or releases.
[CmdletBinding()]
param(
    [string]$RepertoireTravail = (Join-Path $env:USERPROFILE 'Documents\ALM-V2-Publication-GitHub'),
    [switch]$PublierBranche
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoName = 'Gentil-Robot/Anime-Local-Manager'
$remoteUrl = 'https://github.com/Gentil-Robot/Anime-Local-Manager.git'
$branchName = 'publication/v2.0.0-beta-stable'
$source = Split-Path -Parent $MyInvocation.MyCommand.Path

function Run-Git([string[]]$ArgsToRun) {
    # Print the EXACT command before execution: Git exit 128 alone is not a diagnosis.
    # Every caller passes a fixed, validated repository URL (no tokens or passwords).
    $displayArgs = @($ArgsToRun | ForEach-Object {
        $part = [string]$_
        if ($part -match '\s') { '"' + $part + '"' } else { $part }
    })
    $displayCommand = 'git ' + ($displayArgs -join ' ')
    Write-Host ('[GitHub V2] ' + $displayCommand)
    & git @ArgsToRun
    $gitExitCode = $LASTEXITCODE
    if ($gitExitCode -ne 0) {
        throw ('Git a echoue (code ' + $gitExitCode + ') pendant : ' + $displayCommand +
            "`nConsulter les lignes fatal: / error: affichees juste au-dessus. Verifier l etat Git avant toute nouvelle tentative.")
    }
}
function Test-Binaries {
    foreach ($binary in @('git','node')) {
        if (-not (Get-Command $binary -ErrorAction SilentlyContinue)) {
            throw "$binary absent. Installer Git for Windows et Node.js avant de continuer."
        }
    }
    & git lfs version | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Git LFS absent. Installer https://git-lfs.com/ puis ouvrir un nouveau PowerShell.' }
}
Test-Binaries

if ($PublierBranche) {
    if (-not (Test-Path -LiteralPath (Join-Path $RepertoireTravail '.git'))) {
        throw 'Aucun clone prepare dans RepertoireTravail. Relancer le script sans -PublierBranche.'
    }
    $current = ((& git -C $RepertoireTravail branch --show-current) | Out-String).Trim()
    if ($current -ne $branchName) { throw "Branche active inattendue : $current" }
    $status = @(& git -C $RepertoireTravail status --porcelain)
    if ($status.Count -gt 0) { throw 'Arbre Git modifie depuis la preparation. Verifier / committer avant publication.' }
    $remote = ((& git -C $RepertoireTravail remote get-url origin) | Out-String).Trim()
    if ($remote -notmatch '(^https://github\.com/|^git@github\.com:)Gentil-Robot/Anime-Local-Manager(\.git)?$') {
        throw "Distant Git inattendu. Refus de pousser : $remote"
    }
    # Remote may have changed after the local clone. Never force a stale branch.
    Run-Git -ArgsToRun @('-C', $RepertoireTravail, 'fetch', 'origin', $branchName)
    $localSha = ((& git -C $RepertoireTravail rev-parse HEAD) | Out-String).Trim()
    $remoteSha = ((& git -C $RepertoireTravail rev-parse ('origin/' + $branchName)) | Out-String).Trim()
    $ancestor = ((& git -C $RepertoireTravail merge-base $localSha $remoteSha) | Out-String).Trim()
    if ($ancestor -ne $remoteSha) {
        throw 'La branche distante a change : refus de publier par dessus des commits nouveaux. Verifier et rebaser le clone.'
    }
    Write-Warning 'Un push sur GitHub declenche actuellement aussi Vercel si son integration Git est encore connectee. Separer le depot ALM du site Vercel AVANT de publier.'
    Write-Host 'Envoi de la branche de preparation (sans modifier main ni publier un EXE)...'
    Run-Git -ArgsToRun @('-C', $RepertoireTravail, 'push', '--set-upstream', 'origin', $branchName)
    if (Get-Command gh -ErrorAction SilentlyContinue) {
        $existing = & gh pr view $branchName --repo $repoName --json url --jq '.url' 2>$null
        if ($LASTEXITCODE -eq 0 -and $existing) {
            Write-Host "PR existante : $existing"
        } else {
            & gh pr create --repo $repoName --head $branchName --base main --draft --title 'V2.0.0 Beta stable - publication du code source (revue)' --body-file (Join-Path $RepertoireTravail 'docs\PUBLICATION-OPEN-SOURCE-V2.md')
            if ($LASTEXITCODE -ne 0) { Write-Warning 'La branche est poussee, mais la PR brouillon est a creer depuis GitHub.' }
        }
    } else {
        Write-Host ('Creer une PR brouillon via : https://github.com/' + $repoName + '/compare/main...' + $branchName + '?expand=1')
    }
    return
}

if (Test-Path -LiteralPath $RepertoireTravail) {
    throw "Le dossier cible existe deja : $RepertoireTravail. Utiliser un nouveau RepertoireTravail."
}
$nodeVersion = ((& node --version) | Out-String).Trim()
if ($nodeVersion -ne 'v22.23.4') {
    throw "Node.js $nodeVersion detecte ; version attendue v22.23.4 pour cette livraison."
}
Write-Host 'Controle du manifeste des sources et des secrets avant toute operation Git...'
& node (Join-Path $source 'scripts\check-source-files.js')
if ($LASTEXITCODE -ne 0) { throw 'Manifeste de sources invalide.' }
& node (Join-Path $source 'scripts\audit-publication.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Audit des secrets en echec. Aucune publication.' }

$parent = Split-Path -Parent $RepertoireTravail
if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
Write-Host '[GitHub V2] Test du depot distant et de la branche (lecture seule)...'
Run-Git -ArgsToRun @('ls-remote', '--exit-code', '--heads', $remoteUrl, $branchName)
Write-Host 'Clonage de la V1 pour PRESERVER son historique...'
Run-Git -ArgsToRun @('clone', '--', $remoteUrl, $RepertoireTravail)
# This branch was created on GitHub before the V2 sources were uploaded.
# Track that existing remote ref, preserving its license-fix commit and avoiding
# non-fast-forward rejection. Never recreate it from main or force-push.
Run-Git -ArgsToRun @('-C', $RepertoireTravail, 'fetch', 'origin', $branchName)
$remoteBranch = @(& git -C $RepertoireTravail branch -r --list ('origin/' + $branchName))
if ($remoteBranch.Count -eq 0) { throw ('La branche distante est introuvable : origin/' + $branchName) }
Run-Git -ArgsToRun @('-C', $RepertoireTravail, 'switch', '-c', $branchName, '--track', ('origin/' + $branchName))
Run-Git -ArgsToRun @('-C', $RepertoireTravail, 'lfs', 'install', '--local')
# Remove version-1 tracked files in the clone; Git history remains intact.
Run-Git -ArgsToRun @('-C', $RepertoireTravail, 'rm', '-r', '--', '.')
# Copy ONLY explicitly verified files from SOURCE-MANIFEST.json. This
# prevents accidental publication of local logs, accounts or build outputs.
$manifest = Get-Content -LiteralPath (Join-Path $source 'SOURCE-MANIFEST.json') -Raw | ConvertFrom-Json
foreach ($entry in $manifest.files) {
    $sourceFile = Join-Path $source $entry.path
    $destinationFile = Join-Path $RepertoireTravail $entry.path
    $directory = Split-Path -Parent $destinationFile
    if (-not (Test-Path -LiteralPath $directory)) {
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }
    Copy-Item -LiteralPath $sourceFile -Destination $destinationFile -Force
}
Copy-Item -LiteralPath (Join-Path $source 'SOURCE-MANIFEST.json') -Destination $RepertoireTravail -Force
Run-Git -ArgsToRun @('-C', $RepertoireTravail, 'add', '--all')
$clipPointer = ((& git -C $RepertoireTravail show ':public/assets/alm-clip-complet-1080p.mp4') | Out-String).Trim()
if (-not $clipPointer.StartsWith('version https://git-lfs.github.com/spec/v1')) {
    throw 'Le clip n est pas en Git LFS. Aucune publication. Verifier Git LFS et .gitattributes.'
}
$tracked = @(& git -C $RepertoireTravail -c core.quotePath=false ls-files)
$paths = @($manifest.files | ForEach-Object { $_.path })
$missing = @($paths | Where-Object { $tracked -notcontains $_ })
$unexpected = @($tracked | Where-Object { $_ -ne 'SOURCE-MANIFEST.json' -and $paths -notcontains $_ })
if ($missing.Count -gt 0 -or $unexpected.Count -gt 0) {
    throw "Incoherence manifest/Git : $($missing.Count) manquant(s), $($unexpected.Count) inattendu(s). Aucun push."
}
# This is the documented public GitHub no-reply address of the repository owner.
# Keep the maintainer's personal email OUT of the public Git history.
Run-Git -ArgsToRun @('-C', $RepertoireTravail, 'config', 'user.name', 'Gentil Robot')
Run-Git -ArgsToRun @('-C', $RepertoireTravail, 'config', 'user.email', '288048240+Gentil-Robot@users.noreply.github.com')
Run-Git -ArgsToRun @('-C', $RepertoireTravail, 'commit', '-m', 'feat: prepare Anime Local Manager V2.0.0 beta stable open source')
Write-Host "Branche locale prete : $branchName"
Write-Host "Dossier de travail : $RepertoireTravail"
Write-Host 'Aucun push effectue. Aucun EXE publie. Aucun service modifie.'
Write-Host 'Apres revue, pour envoyer la branche :'
Write-Host ('& "' + $PSCommandPath + '" -PublierBranche -RepertoireTravail "' + $RepertoireTravail + '"')
