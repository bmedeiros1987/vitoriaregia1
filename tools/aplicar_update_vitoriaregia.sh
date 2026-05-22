#!/usr/bin/env bash
set -Eeuo pipefail
DOWNLOAD_DIR="/storage/emulated/0/Download"
SCRIPT_LOCAL="${DOWNLOAD_DIR}/atualizador_profissional_vitoriaregia.sh"
SCRIPT_REPO="tools/atualizador_profissional_vitoriaregia.sh"

if [ -f "$SCRIPT_LOCAL" ]; then
  bash "$SCRIPT_LOCAL" "${1:-update}" "${2:-${DOWNLOAD_DIR}/vitoriaregia_update.zip}"
  exit $?
fi

if [ -f "$SCRIPT_REPO" ]; then
  bash "$SCRIPT_REPO" "${1:-update}" "${2:-${DOWNLOAD_DIR}/vitoriaregia_update.zip}"
  exit $?
fi

echo "Atualizador profissional não encontrado. Coloque atualizador_profissional_vitoriaregia.sh em ${DOWNLOAD_DIR}."
exit 1
