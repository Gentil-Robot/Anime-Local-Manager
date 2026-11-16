#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$ROOT_DIR"

log() { printf '\n\033[1;36m[Anime Local Manager]\033[0m %s\n' "$*"; }
fail() { printf '\n\033[1;31mErreur :\033[0m %s\n' "$*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || fail "Node.js 24.22.3 LTS est conseillé (voir .node-version)."
command -v npm >/dev/null 2>&1 || fail "npm est requis."
node -e 'process.exit(require("./scripts/release-windows").validNode()?0:1)' || fail "Node.js corrigé 22.23.5+ ou 24.22.3+ requis dans sa branche LTS (version détectée : $(node --version))."

log "Préparation du build Linux V2.1.3 Beta stable"
printf 'Node : %s\nnpm  : %s\n' "$(node --version)" "$(npm --version)"

if [ "${ALM_SKIP_INSTALL:-0}" != "1" ]; then
  log "Installation des dépendances"
  if [ -f package-lock.json ]; then
    npm ci --no-audit --no-fund
  else
    printf 'Avertissement : package-lock.json absent, utilisation de npm install.\n' >&2
    npm install --no-audit --no-fund
  fi
else
  [ -d node_modules ] || fail "ALM_SKIP_INSTALL=1 mais node_modules est absent."
  log "Installation npm ignorée à la demande"
fi

log "Contrôles du projet"
npm run verify

log "Validation de la metadata embarquée"
npm run metadata:release

TARGETS_RAW="${ALM_LINUX_TARGETS:-AppImage deb}"
read -r -a TARGETS <<< "$TARGETS_RAW"
[ "${#TARGETS[@]}" -gt 0 ] || TARGETS=(AppImage deb)

log "Nettoyage des anciens artefacts"
rm -rf dist

log "Création des paquets : ${TARGETS[*]}"
./node_modules/.bin/electron-builder --linux "${TARGETS[@]}" --publish never

mkdir -p dist
CHECKSUM_NAME="SHA256SUMS-V2.1.3-Beta-Stable.txt"
CHECKSUM_FILE="dist/$CHECKSUM_NAME"
: > "$CHECKSUM_FILE"
while IFS= read -r -d '' artifact; do
  artifact_name="$(basename -- "$artifact")"
  artifact_hash="$(sha256sum "$artifact" | awk '{print $1}')"
  printf '%s  %s\n' "$artifact_hash" "$artifact_name" >> "$CHECKSUM_FILE"
done < <(find dist -maxdepth 1 -type f \( -name '*.AppImage' -o -name '*.deb' -o -name '*.tar.gz' \) -print0 | sort -z)

log "Build terminé"
find dist -maxdepth 1 -type f -printf '  %f\n' | sort
printf '\nChecksums : %s\n' "$CHECKSUM_FILE"
printf 'Données utilisateur : dossier userData Electron (souvent ~/.config/Anime Local Manager)\n'
printf 'AppImage sans FUSE : ./NomDuFichier.AppImage --appimage-extract-and-run\n'
