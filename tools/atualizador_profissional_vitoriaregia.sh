#!/usr/bin/env bash
set -euo pipefail

VERSION="3.1.0"
REPO_URL="https://github.com/bmedeiros1987/vitoriaregia1.git"
WORKDIR="${HOME}/vitoriaregia1"
DOWNLOAD_ZIP="/storage/emulated/0/Download/vitoriaregia_sistema_completo_v${VERSION}.zip"
FALLBACK_ZIP="/storage/emulated/0/Download/vitoriaregia_update.zip"
BACKUP_DIR="${HOME}/vitoriaregia_backups"
MODE="${1:-update}"

mkdir -p "$BACKUP_DIR"

echo "Vitória Régia Atualizador Profissional v${VERSION}"
echo "Modo: $MODE"

if [ -d "$WORKDIR/.git" ]; then
  BACKUP_FILE="$BACKUP_DIR/backup_$(date +%Y%m%d_%H%M%S).tar.gz"
  echo "Criando backup local: $BACKUP_FILE"
  tar -czf "$BACKUP_FILE" -C "$WORKDIR" . || true
fi

rm -rf "$WORKDIR.tmp"
git clone "$REPO_URL" "$WORKDIR.tmp"

ZIP_FILE="$DOWNLOAD_ZIP"
if [ ! -f "$ZIP_FILE" ]; then ZIP_FILE="$FALLBACK_ZIP"; fi
if [ ! -f "$ZIP_FILE" ]; then
  echo "ERRO: ZIP não encontrado. Coloque em:"
  echo "$DOWNLOAD_ZIP"
  echo "ou"
  echo "$FALLBACK_ZIP"
  exit 1
fi

echo "Aplicando ZIP: $ZIP_FILE"
unzip -oq "$ZIP_FILE" -d "$WORKDIR.tmp/__update"

if [ -d "$WORKDIR.tmp/__update/substituir-no-repositorio" ]; then
  rsync -a "$WORKDIR.tmp/__update/substituir-no-repositorio/" "$WORKDIR.tmp/"
else
  rsync -a "$WORKDIR.tmp/__update/" "$WORKDIR.tmp/"
fi
rm -rf "$WORKDIR.tmp/__update"

cd "$WORKDIR.tmp"
node verificar_arquivos_criticos.js
node --check app.js
node --check backend/src/server.js

git config user.name "Bruno Saraiva"
git config user.email "bmedeiros1987@gmail.com"
git add .
if git diff --cached --quiet; then
  echo "Nenhuma alteração para enviar."
else
  git commit -m "Atualização Vitória Régia v${VERSION}"
  echo "Cole seu token GitHub quando solicitado."
  read -r -s -p "Token GitHub: " GITHUB_TOKEN
  echo ""
  git remote set-url origin "https://bmedeiros1987:${GITHUB_TOKEN}@github.com/bmedeiros1987/vitoriaregia1.git"
  git push origin main
  git remote set-url origin "$REPO_URL"
fi

rm -rf "$WORKDIR"
mv "$WORKDIR.tmp" "$WORKDIR"
echo "Atualização concluída. Faça Manual Deploy no Render se o Auto Deploy não iniciar."
