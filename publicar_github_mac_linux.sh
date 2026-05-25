#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$ROOT/sistema"
LOG="$ROOT/vitoriaregia_v93_publicacao.log"
echo "===== Publicador Vitória Régia Pro v9.4 - Mac/Linux =====" | tee "$LOG"
erro(){ echo "" | tee -a "$LOG"; echo "ERRO: $1" | tee -a "$LOG"; echo "Log salvo em: $LOG"; exit 1; }
info(){ echo "▶ $1" | tee -a "$LOG"; }
ok(){ echo "OK: $1" | tee -a "$LOG"; }
command -v git >/dev/null 2>&1 || erro "git não encontrado."
[ -f "$SRC/package.json" ] || erro "não encontrei sistema/package.json."
read -r -p "URL do repositório GitHub [https://github.com/bmedeiros1987/vitoriaregia1.git]: " REPO_URL
REPO_URL="${REPO_URL:-https://github.com/bmedeiros1987/vitoriaregia1.git}"
read -r -p "Branch [main]: " BRANCH
BRANCH="${BRANCH:-main}"
read -r -p "Nome do autor do commit [Bruno Saraiva]: " GIT_NAME
GIT_NAME="${GIT_NAME:-Bruno Saraiva}"
read -r -p "E-mail do autor do commit [bmedeiros1987@gmail.com]: " GIT_EMAIL
GIT_EMAIL="${GIT_EMAIL:-bmedeiros1987@gmail.com}"
read -rs -p "Cole o token temporário do GitHub: " TOKEN; echo ""
[ -n "$TOKEN" ] || erro "token vazio."
AUTH="$(printf 'x-access-token:%s' "$TOKEN" | base64 | tr -d '\n')"
WORK="${TMPDIR:-/tmp}/vitoriaregia_v93_$(date +%Y%m%d_%H%M%S)"
REPO="$WORK/repo"
mkdir -p "$WORK"
info "Clonando repositório"
git -c "http.extraheader=AUTHORIZATION: basic $AUTH" clone --branch "$BRANCH" --single-branch "$REPO_URL" "$REPO" >> "$LOG" 2>&1 || erro "falha ao clonar. Confira URL, branch e token."
info "Limpando repositório local e copiando sistema Pro"
find "$REPO" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -a "$SRC"/. "$REPO"/
info "Removendo artefatos e segredos antes do commit"
rm -f "$REPO/.env" "$REPO/server/.env" "$REPO/client/.env" "$REPO/.env.local" "$REPO/server/.env.local" "$REPO/client/.env.local"
rm -f "$REPO/package-lock.json" "$REPO/server/package-lock.json" "$REPO/client/package-lock.json"
rm -rf "$REPO/server/public" "$REPO/client/dist" "$REPO/dist" "$REPO/build" "$REPO/.cache" "$REPO/coverage" "$REPO/client/.vite" "$REPO/server/.vite" 2>/dev/null || true
find "$REPO" -type d -name node_modules -prune -exec rm -rf {} + 2>/dev/null || true
find "$REPO" -type d \( -name dist -o -name build -o -name .cache -o -name coverage -o -name .vite \) -prune -exec rm -rf {} + 2>/dev/null || true
find "$REPO" -type f \( -name '*.log' -o -name '*.pem' -o -name '*.key' -o -name '*.crt' -o -name '*.p12' -o -name '*.pfx' -o -name '*.jks' -o -name '*.keystore' \) -delete 2>/dev/null || true
cat > "$REPO/.gitignore" <<'EOF'
node_modules/
**/node_modules/
server/public/
client/dist/
dist/
build/
.cache/
coverage/
.vite/
.env
.env.*
!.env.example
server/.env
server/.env.*
client/.env
client/.env.*
*.pem
*.key
*.crt
*.p12
*.pfx
*.jks
*.keystore
*.log
.DS_Store
Thumbs.db
.vscode/
.idea/
*.sqlite
*.sqlite3
*.db
backup-*.json
EOF
cd "$REPO"
git config user.name "$GIT_NAME"
git config user.email "$GIT_EMAIL"
git add -A
STAGED="$(git diff --cached --name-only --diff-filter=ACMR || true)"
[ -n "$STAGED" ] || { ok "nenhuma alteração nova para publicar."; exit 0; }
info "Conferindo arquivos sensíveis"
BLOCKED=""
while IFS= read -r f; do
  [ -z "$f" ] && continue
  if [[ "$f" =~ (^|/)(node_modules|dist|build|\.cache|coverage|\.vite)(/|$) ]]; then BLOCKED="$BLOCKED
$f"; fi
  if [[ "$f" =~ (^|/)server/public(/|$) ]]; then BLOCKED="$BLOCKED
$f"; fi
  if [[ "$f" =~ (^|/)\.env($|\.) && ! "$f" =~ (^|/)\.env\.example$ ]]; then BLOCKED="$BLOCKED
$f"; fi
  if [[ "$f" =~ \.(pem|key|crt|p12|pfx|jks|keystore)$ ]]; then BLOCKED="$BLOCKED
$f"; fi
done <<< "$STAGED"
[ -z "${BLOCKED//[[:space:]]/}" ] || { echo "$BLOCKED" | tee -a "$LOG"; erro "commit bloqueado por arquivo sensível."; }
while IFS= read -r f; do
  [ -z "$f" ] && continue
  [ -f "$f" ] || continue
  case "$f" in *.png|*.jpg|*.jpeg|*.gif|*.webp|*.ico|*.pdf|*.zip|*.woff|*.woff2|*.ttf|*.svg|*.mp4|*.md|*.txt|*.example|.env.example) continue ;; esac
  if grep -I -n -E 'ghp_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{30,}|postgres(ql)?://[^:[:space:]/@]+:[^@[:space:]]+@|mysql://[^:[:space:]/@]+:[^@[:space:]]+@|[0-9]{8,}:[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{20,}|SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}' "$f" >> "$LOG" 2>/dev/null; then
    erro "commit bloqueado para evitar vazamento de senha/token: $f"
  fi
done <<< "$STAGED"
ok "limpeza segura aprovada"
info "Criando commit"
git commit -m "Publica Vitória Régia Pro v9.4 com migração segura do banco legado e central de atualizações" >> "$LOG" 2>&1 || true
info "Enviando para GitHub"
git -c "http.extraheader=AUTHORIZATION: basic $AUTH" push origin "HEAD:$BRANCH" >> "$LOG" 2>&1 || erro "push não concluído. Confira token e permissão."
git remote set-url origin "$REPO_URL" || true
unset TOKEN AUTH
ok "GitHub atualizado."
echo "Agora no Render: Manual Deploy → Clear build cache & deploy" | tee -a "$LOG"
echo "Para gerar APKs: GitHub → Actions → Gerar APKs Android Vitória Régia Pro → Run workflow" | tee -a "$LOG"
