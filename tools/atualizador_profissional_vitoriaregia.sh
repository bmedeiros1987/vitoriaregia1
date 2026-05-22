#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="vitoriaregia1"
GITHUB_USER="bmedeiros1987"
GITHUB_EMAIL="bmedeiros1987@gmail.com"
REPO_NAME="vitoriaregia1"
BRANCH="main"
REPO_URL="https://github.com/${GITHUB_USER}/${REPO_NAME}.git"
RAW_SERVER_URL="https://raw.githubusercontent.com/${GITHUB_USER}/${REPO_NAME}/${BRANCH}/backend/src/server.js"
DOWNLOAD_DIR="/storage/emulated/0/Download"
ZIP_PATH_DEFAULT="${DOWNLOAD_DIR}/vitoriaregia_update.zip"
WORKDIR="${HOME}/${APP_NAME}"
BACKUP_DIR="${DOWNLOAD_DIR}/vitoriaregia_backups"
LOG_DIR="${DOWNLOAD_DIR}/vitoriaregia_logs"
RUN_ID="$(date +%Y%m%d_%H%M%S)"
LOG_FILE="${LOG_DIR}/update_${RUN_ID}.log"
MODE="${1:-update}"
ZIP_PATH="${2:-$ZIP_PATH_DEFAULT}"

mkdir -p "$BACKUP_DIR" "$LOG_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1

say() { printf '\n\033[1;36m%s\033[0m\n' "$*"; }
warn() { printf '\n\033[1;33mAVISO: %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mERRO: %s\033[0m\n' "$*"; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Comando obrigatório não encontrado: $1. Instale com: pkg install git unzip rsync nodejs-lts curl -y"
}

for cmd in git unzip rsync node tar sed grep; do need_cmd "$cmd"; done
command -v curl >/dev/null 2>&1 || warn "curl não encontrado; restauração remota por URL ficará limitada."

git_safe_config() {
  git config --global --add safe.directory "$WORKDIR" >/dev/null 2>&1 || true
  git config --global user.name "Bruno Saraiva"
  git config --global user.email "$GITHUB_EMAIL"
}

backup_current() {
  if [ -d "$WORKDIR" ]; then
    local backup="${BACKUP_DIR}/${APP_NAME}_${RUN_ID}.tar.gz"
    say "Criando backup antes da atualização"
    tar -czf "$backup" -C "$HOME" "$APP_NAME"
    echo "Backup criado: $backup"
  else
    warn "Diretório local ainda não existe; backup inicial não necessário."
  fi
}

clone_clean() {
  say "Preparando cópia limpa do GitHub"
  if [ -d "$WORKDIR/.git" ]; then
    cd "$WORKDIR"
    git_safe_config
    git remote set-url origin "$REPO_URL"
    git fetch origin "$BRANCH"
    git reset --hard "origin/${BRANCH}"
    git clean -fd -e node_modules -e .env -e backend/.env
  else
    if [ -d "$WORKDIR" ]; then
      mv "$WORKDIR" "${WORKDIR}_sem_git_${RUN_ID}"
      warn "Diretório antigo sem .git movido para ${WORKDIR}_sem_git_${RUN_ID}"
    fi
    git clone --branch "$BRANCH" "$REPO_URL" "$WORKDIR"
  fi
  cd "$WORKDIR"
  git_safe_config
}

restore_server_from_git_or_raw() {
  cd "$WORKDIR"
  mkdir -p backend/src
  if [ -s "backend/src/server.js" ]; then
    echo "backend/src/server.js encontrado."
    return 0
  fi

  warn "backend/src/server.js ausente. Restaurando automaticamente."
  git fetch origin "$BRANCH" || true
  if git show "origin/${BRANCH}:backend/src/server.js" > backend/src/server.js.tmp 2>/dev/null; then
    mv backend/src/server.js.tmp backend/src/server.js
    echo "server.js restaurado a partir do GitHub/origin."
    return 0
  fi

  if command -v curl >/dev/null 2>&1 && curl -fsSL "$RAW_SERVER_URL" -o backend/src/server.js.tmp; then
    mv backend/src/server.js.tmp backend/src/server.js
    echo "server.js restaurado a partir do raw.githubusercontent.com."
    return 0
  fi

  warn "Não foi possível baixar o server.js original. Criando servidor emergencial mínimo."
  cat > backend/src/server.js <<'SERVER_EOF'
'use strict';
require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const app = express();
const PORT = Number(process.env.PORT || 10000);
const FRONTEND_DIR = process.env.FRONTEND_DIR ? path.resolve(process.env.FRONTEND_DIR) : path.resolve(__dirname, '../../');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.get('/api/health', (req, res) => res.json({ ok: true, mode: 'emergency-server', message: 'Backend emergencial ativo. Restaurar server.js original pelo atualizador.' }));
try { app.use(express.static(FRONTEND_DIR)); } catch (_) {}
app.get('*', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));
app.listen(PORT, () => console.log(`Vitória Régia emergencial na porta ${PORT}`));
SERVER_EOF
}

apply_zip_update() {
  if [ "$MODE" = "repair" ]; then
    warn "Modo repair: não vou aplicar ZIP, apenas reparar arquivos críticos e enviar ao GitHub."
    return 0
  fi

  [ -f "$ZIP_PATH" ] || fail "ZIP de atualização não encontrado em: $ZIP_PATH"
  say "Aplicando pacote de atualização"
  local temp_dir
  temp_dir="$(mktemp -d)"
  unzip -q "$ZIP_PATH" -d "$temp_dir"

  local source_dir="$temp_dir"
  if [ -d "$temp_dir/substituir-no-repositorio" ]; then
    source_dir="$temp_dir/substituir-no-repositorio"
  fi

  cd "$WORKDIR"
  # Proteção: não apaga nada e não sobrescreve o servidor principal por padrão.
  # Para permitir alteração futura do server.js: UPDATE_ALLOW_SERVER_OVERWRITE=1 bash atualizador_profissional_vitoriaregia.sh
  local exclude_server=(--exclude 'backend/src/server.js')
  if [ "${UPDATE_ALLOW_SERVER_OVERWRITE:-0}" = "1" ]; then
    exclude_server=()
    warn "UPDATE_ALLOW_SERVER_OVERWRITE=1 ativo; server.js poderá ser sobrescrito."
  fi

  rsync -a \
    --exclude '.git' \
    --exclude 'node_modules' \
    --exclude '.env' \
    --exclude 'backend/.env' \
    "${exclude_server[@]}" \
    "$source_dir/" "$WORKDIR/"

  rm -rf "$temp_dir"
}

run_injectors() {
  cd "$WORKDIR"
  say "Executando instaladores visuais e integrações"
  local files=(
    instalar_update_completo.js
    injetar_layout_limpo.js
    injetar_notificacoes.js
    injetar_botao_panico.js
    injetar_dashboard_compacto.js
    injetar_ux_plus.js
    injetar_update_center.js
    injetar_backend_notificacoes.js
    injetar_backend_panico.js
  )
  for f in "${files[@]}"; do
    if [ -f "$f" ]; then
      echo "- node $f"
      node "$f" || warn "Instalador $f retornou erro; seguindo para validação."
    fi
  done
}

validate_project() {
  cd "$WORKDIR"
  say "Validando arquivos críticos"
  [ -f "backend/package.json" ] || fail "backend/package.json ausente."
  restore_server_from_git_or_raw
  [ -s "backend/src/server.js" ] || fail "backend/src/server.js continua ausente."
  node --check backend/src/server.js || fail "backend/src/server.js existe, mas contém erro de sintaxe."

  if [ -f "index.html" ]; then
    echo "index.html encontrado."
  else
    warn "index.html não encontrado na raiz. Verifique se o frontend está em outra pasta."
  fi

  echo "Validação concluída."
}

commit_and_push() {
  cd "$WORKDIR"
  say "Preparando commit"
  git add -A
  if git diff --cached --quiet; then
    echo "Nenhuma alteração nova para enviar."
    return 0
  fi
  git commit -m "Atualização automática Vitória Régia ${RUN_ID}"

  printf '\nEnviar automaticamente para o GitHub agora? [S/n]: '
  read -r answer || true
  answer="${answer:-S}"
  case "$answer" in
    n|N|nao|não|NAO|NÃO)
      warn "Commit criado localmente, mas não enviado. Diretório: $WORKDIR"
      return 0
      ;;
  esac

  printf 'Cole seu token novo do GitHub: '
  stty -echo || true
  read -r GITHUB_TOKEN || true
  stty echo || true
  printf '\n'
  [ -n "${GITHUB_TOKEN:-}" ] || fail "Token não informado."

  git remote set-url origin "https://${GITHUB_USER}:${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${REPO_NAME}.git"
  if ! git push origin "$BRANCH"; then
    warn "Push rejeitado. Tentando rebase e novo envio."
    git fetch origin "$BRANCH"
    git pull --rebase --autostash origin "$BRANCH"
    git push origin "$BRANCH"
  fi
  git remote set-url origin "$REPO_URL"
  unset GITHUB_TOKEN
  echo "Atualização enviada ao GitHub. O Render deve redeployar se Auto Deploy estiver ativo."
}

rollback_latest() {
  say "Iniciando rollback"
  local latest
  latest="$(ls -t "$BACKUP_DIR"/${APP_NAME}_*.tar.gz 2>/dev/null | head -n 1 || true)"
  [ -n "$latest" ] || fail "Nenhum backup encontrado em $BACKUP_DIR"
  rm -rf "$WORKDIR"
  tar -xzf "$latest" -C "$HOME"
  echo "Rollback restaurado de: $latest"
}

show_status() {
  say "Status do sistema local"
  echo "Diretório: $WORKDIR"
  echo "ZIP padrão: $ZIP_PATH_DEFAULT"
  echo "Logs: $LOG_DIR"
  echo "Backups: $BACKUP_DIR"
  if [ -d "$WORKDIR/.git" ]; then
    cd "$WORKDIR"
    git status --short || true
    [ -f backend/src/server.js ] && echo "server.js: OK" || echo "server.js: AUSENTE"
  fi
}

case "$MODE" in
  rollback)
    rollback_latest
    ;;
  status)
    show_status
    ;;
  repair|update|*)
    backup_current
    clone_clean
    apply_zip_update
    run_injectors
    validate_project
    commit_and_push
    say "Processo finalizado"
    echo "Log salvo em: $LOG_FILE"
    ;;
esac
