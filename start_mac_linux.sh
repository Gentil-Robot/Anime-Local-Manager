#!/usr/bin/env bash
set -Eeuo pipefail
ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$ROOT_DIR"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  printf 'Node.js 22 ou plus récent et npm sont requis.\n' >&2
  exit 1
fi
NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if [ "$NODE_MAJOR" -lt 22 ]; then
  printf 'Node.js 22 minimum requis. Version détectée : %s\n' "$(node --version)" >&2
  exit 1
fi
if [ ! -d node_modules ]; then
  printf 'Les dépendances ne sont pas installées. Lancez : npm install\n' >&2
  exit 1
fi

if [ "${ALM_WEB_ONLY:-0}" = "1" ]; then
  printf 'Démarrage du serveur local sur http://127.0.0.1:3123\n'
  exec npm start
fi

exec npm run app
