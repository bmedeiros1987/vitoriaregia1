#!/usr/bin/env bash
set -euo pipefail

APP_NAME="Vitória Régia"
GITHUB_USER="bmedeiros1987"
GITHUB_EMAIL="bmedeiros1987@gmail.com"
REPO_NAME="vitoriaregia1"
BRANCH="main"
REPO_URL_PUBLIC="https://github.com/${GITHUB_USER}/${REPO_NAME}.git"
DOWNLOAD_DIR="/storage/emulated/0/Download"
UPDATE_ZIP_DEFAULT="${DOWNLOAD_DIR}/vitoriaregia_update.zip"
WORK_ROOT="${HOME}/.vitoriaregia_updater"
REPO_DIR="${WORK_ROOT}/${REPO_NAME}"
BACKUP_ROOT="${WORK_ROOT}/backups"
LOG_FILE="${WORK_ROOT}/atualizacoes.log"
MODE="${1:-update}"
CUSTOM_ZIP="${2:-}"

mkdir -p "$WORK_ROOT" "$BACKUP_ROOT"

ts() { date '+%Y-%m-%d %H:%M:%S'; }
log() { echo "[$(ts)] $*" | tee -a "$LOG_FILE"; }
fail() { log "ERRO: $*"; exit 1; }
need_cmd() { command -v "$1" >/dev/null 2>&1 || fail "Comando obrigatório ausente: $1. Instale com pkg install $1 -y"; }

print_header() {
  echo ""
  echo "=============================================="
  echo "  Atualizador Profissional - ${APP_NAME}"
  echo "=============================================="
  echo "Modo: ${MODE}"
  echo "Log: ${LOG_FILE}"
  echo ""
}

ensure_tools() {
  need_cmd git
  need_cmd unzip
  need_cmd rsync
  need_cmd node
}

ask_token() {
  if [[ -n "${GITHUB_TOKEN:-}" ]]; then return 0; fi
  echo "Cole um token NOVO do GitHub. Ele não será salvo no arquivo."
  read -r -s -p "Token GitHub: " GITHUB_TOKEN
  echo ""
  [[ -n "$GITHUB_TOKEN" ]] || fail "Token vazio."
}

auth_url() {
  printf 'https://%s:%s@github.com/%s/%s.git' "$GITHUB_USER" "$GITHUB_TOKEN" "$GITHUB_USER" "$REPO_NAME"
}

backup_existing_repo() {
  if [[ -d "$REPO_DIR" ]]; then
    local stamp backup
    stamp="$(date '+%Y%m%d-%H%M%S')"
    backup="${BACKUP_ROOT}/${REPO_NAME}-${stamp}"
    log "Criando backup da cópia local: ${backup}"
    cp -a "$REPO_DIR" "$backup"
  fi
}

fresh_clone() {
  ask_token
  backup_existing_repo
  rm -rf "$REPO_DIR"
  log "Clonando cópia limpa do GitHub..."
  git clone --depth=1 --branch "$BRANCH" "$(auth_url)" "$REPO_DIR"
  cd "$REPO_DIR"
  git remote set-url origin "$REPO_URL_PUBLIC"
  git config user.name "$GITHUB_USER"
  git config user.email "$GITHUB_EMAIL"
}

find_update_zip() {
  local zip_path="${CUSTOM_ZIP:-$UPDATE_ZIP_DEFAULT}"
  [[ -f "$zip_path" ]] || fail "Update ZIP não encontrado: ${zip_path}"
  echo "$zip_path"
}

apply_update_zip() {
  local zip_path tmp_dir source_dir
  zip_path="$(find_update_zip)"
  tmp_dir="${WORK_ROOT}/unzip-$(date '+%Y%m%d-%H%M%S')"
  rm -rf "$tmp_dir"
  mkdir -p "$tmp_dir"
  log "Extraindo update: ${zip_path}"
  unzip -q "$zip_path" -d "$tmp_dir"
  if [[ -d "$tmp_dir/substituir-no-repositorio" ]]; then
    source_dir="$tmp_dir/substituir-no-repositorio"
  else
    source_dir="$tmp_dir"
  fi
  log "Aplicando arquivos no repositório..."
  rsync -a "$source_dir/" "$REPO_DIR/"
}

write_recovery_server_if_needed() {
  mkdir -p "$REPO_DIR/backend/src"
  if [[ -f "$REPO_DIR/backend/src/server.js" ]]; then
    if grep -q "Modo: recuperação segura\|recovery-server" "$REPO_DIR/backend/src/server.js"; then
      log "server.js de recuperação já presente."
      return 0
    fi
    log "server.js existente encontrado. Será mantido, mas validado."
    return 0
  fi
  fail "backend/src/server.js ausente após aplicar update. O ZIP deve conter a correção."
}

ensure_render_yaml() {
  if [[ ! -f "$REPO_DIR/render.yaml" ]]; then
    fail "render.yaml ausente. O ZIP deve conter render.yaml corrigido."
  fi
  if ! grep -q "rootDir: backend" "$REPO_DIR/render.yaml"; then
    log "Aviso: render.yaml não contém rootDir: backend. Confira no Render."
  fi
}

validate_project() {
  cd "$REPO_DIR"
  [[ -f "index.html" ]] || fail "index.html não encontrado na raiz. O site ficaria em Not Found."
  [[ -f "backend/package.json" ]] || fail "backend/package.json não encontrado."
  [[ -f "backend/src/server.js" ]] || fail "backend/src/server.js não encontrado."
  log "Validando sintaxe do backend..."
  node -c backend/src/server.js
  log "Validação concluída: index.html, package.json e server.js existem."
}

commit_and_push() {
  cd "$REPO_DIR"
  if [[ -z "$(git status --porcelain)" ]]; then
    log "Nenhuma alteração nova para enviar."
    return 0
  fi
  git add .
  git commit -m "Corrige deploy Render e atualiza sistema Vitória Régia"
  ask_token
  git remote set-url origin "$(auth_url)"
  log "Enviando para GitHub..."
  if ! git push origin "$BRANCH"; then
    log "Push recusado. Atualizando branch e tentando novamente..."
    git pull --rebase --autostash origin "$BRANCH"
    git push origin "$BRANCH"
  fi
  git remote set-url origin "$REPO_URL_PUBLIC"
  unset GITHUB_TOKEN
  log "Atualização enviada com sucesso. Faça Manual Deploy no Render se o Auto Deploy não iniciar."
}

status_mode() {
  print_header
  echo "Repositório local: ${REPO_DIR}"
  echo "Update padrão: ${UPDATE_ZIP_DEFAULT}"
  echo ""
  if [[ -d "$REPO_DIR/.git" ]]; then
    cd "$REPO_DIR"
    git status --short || true
    echo ""
    [[ -f index.html ]] && echo "OK index.html" || echo "FALTA index.html"
    [[ -f backend/src/server.js ]] && echo "OK backend/src/server.js" || echo "FALTA backend/src/server.js"
    [[ -f backend/package.json ]] && echo "OK backend/package.json" || echo "FALTA backend/package.json"
  else
    echo "Ainda não há cópia local clonada pelo atualizador."
  fi
}

rollback_mode() {
  print_header
  local last
  last="$(ls -1dt "$BACKUP_ROOT"/${REPO_NAME}-* 2>/dev/null | head -1 || true)"
  [[ -n "$last" ]] || fail "Nenhum backup encontrado para rollback."
  rm -rf "$REPO_DIR"
  cp -a "$last" "$REPO_DIR"
  log "Rollback local restaurado de: ${last}"
  echo "Para enviar o rollback ao GitHub, rode: bash $0 push-current"
}

push_current_mode() {
  print_header
  ensure_tools
  [[ -d "$REPO_DIR/.git" ]] || fail "Repositório local não encontrado."
  validate_project
  commit_and_push
}

update_mode() {
  print_header
  ensure_tools
  fresh_clone
  apply_update_zip
  write_recovery_server_if_needed
  ensure_render_yaml
  validate_project
  commit_and_push
}

repair_mode() {
  print_header
  ensure_tools
  fresh_clone
  apply_update_zip
  write_recovery_server_if_needed
  ensure_render_yaml
  validate_project
  commit_and_push
}

case "$MODE" in
  update|install) update_mode ;;
  repair|corrigir|not-found) repair_mode ;;
  status) status_mode ;;
  rollback) rollback_mode ;;
  push-current) push_current_mode ;;
  *)
    echo "Uso: bash $0 [update|repair|status|rollback|push-current] [caminho-do-zip]"
    exit 1
    ;;
esac
