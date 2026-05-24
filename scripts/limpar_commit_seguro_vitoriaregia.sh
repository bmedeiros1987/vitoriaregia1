#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail

LOG="${LOG:-/storage/emulated/0/Download/vitoriaregia_limpeza_commit.log}"
mkdir -p "$(dirname "$LOG")" 2>/dev/null || true
: > "$LOG" 2>/dev/null || LOG="$HOME/vitoriaregia_limpeza_commit.log"

info(){ echo "▶ $1" | tee -a "$LOG"; }
ok(){ echo "OK: $1" | tee -a "$LOG"; }
warn(){ echo "AVISO: $1" | tee -a "$LOG"; }
erro(){ echo "" | tee -a "$LOG"; echo "ERRO: $1" | tee -a "$LOG"; echo "Log salvo em: $LOG" | tee -a "$LOG"; exit 1; }

TARGET="${1:-$(pwd)}"
[ -d "$TARGET" ] || erro "pasta não encontrada: $TARGET"
cd "$TARGET" || erro "não consegui entrar em $TARGET"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || erro "esta pasta não é um repositório Git. Entre na pasta do repositório e rode de novo."
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT" || erro "não consegui entrar na raiz do repositório"

clear || true
echo "============================================================" | tee -a "$LOG"
echo "  Limpeza segura - Vitória Régia Pro" | tee -a "$LOG"
echo "============================================================" | tee -a "$LOG"
echo "Repositório: $ROOT" | tee -a "$LOG"

info "Atualizando .gitignore blindado"
cat > .gitignore <<'GITIGNORE'
# Dependências
node_modules/
**/node_modules/

# Builds, caches e artefatos gerados
client/dist/
dist/
build/
.vite/
.cache/
coverage/

# Ambientes e segredos
.env
.env.*
*.env
*.env.*
**/.env
**/.env.*
!.env.example
!**/.env.example

# Logs e arquivos temporários
*.log
.DS_Store
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Certificados/chaves locais
*.pem
*.key
*.crt
certs/
**/certs/

# Arquivos auxiliares que podem conter segredos
*render_env*.txt
*vitoriaregia*.env.txt
*env_preenchido*.sh
*AUTO_preenchido*.sh
atualizar_render*.sh
GITIGNORE

info "Removendo da fila do Git arquivos que nunca devem ir para o GitHub"
git reset -q || true

# Remove apenas do índice do Git; os arquivos locais .env são preservados para o sistema continuar funcionando.
while IFS= read -r -d '' tracked; do
  case "$tracked" in
    .env|.env.*|*.env|*.env.*|*/.env|*/.env.*|*/node_modules/*|node_modules/*|client/dist/*|dist/*|build/*|*.log|*.pem|*.key|*.crt|certs/*|*/certs/*|*render_env*.txt|*vitoriaregia*.env.txt|*env_preenchido*.sh|*AUTO_preenchido*.sh|atualizar_render*.sh)
      case "$tracked" in
        .env.example|*/.env.example) ;;
        *) git rm -r --cached --ignore-unmatch -- "$tracked" >> "$LOG" 2>&1 || true ;;
      esac
    ;;
  esac
done < <(git ls-files -z)

info "Apagando artefatos pesados locais que podem ter sido gerados"
find . -path './.git' -prune -o -type d \( -name node_modules -o -path './client/dist' -o -name dist -o -name build \) -print0 2>/dev/null |
while IFS= read -r -d '' dir; do
  case "$dir" in
    .|./.git) ;;
    *) rm -rf "$dir" >> "$LOG" 2>&1 || true ;;
  esac
done
find . -path './.git' -prune -o -type f \( -name '*.log' -o -name '*.pem' -o -name '*.key' -o -name '*.crt' -o -name '*render_env*.txt' -o -name '*env_preenchido*.sh' -o -name '*AUTO_preenchido*.sh' -o -name 'atualizar_render*.sh' \) -delete 2>> "$LOG" || true

info "Preparando commit seguro"
git add -A

BAD_FILES=""
while IFS= read -r -d '' staged; do
  case "$staged" in
    .env.example|*/.env.example) continue ;;
  esac
  case "$staged" in
    .env|.env.*|*.env|*.env.*|*/.env|*/.env.*|*/node_modules/*|node_modules/*|client/dist/*|dist/*|build/*|*.log|*.pem|*.key|*.crt|certs/*|*/certs/*|*render_env*.txt|*vitoriaregia*.env.txt|*env_preenchido*.sh|*AUTO_preenchido*.sh|atualizar_render*.sh)
      BAD_FILES="${BAD_FILES}${staged}
"
    ;;
  esac
done < <(git diff --cached --name-only --diff-filter=ACMR -z)

if [ -n "$BAD_FILES" ]; then
  echo "Arquivos proibidos ainda estão no commit:" | tee -a "$LOG"
  printf '%s' "$BAD_FILES" | tee -a "$LOG"
  git reset -q || true
  erro "commit bloqueado para evitar envio de .env, node_modules, dist, logs ou chaves"
fi

info "Procurando segredos óbvios nos arquivos que serão enviados"
SUSPEITOS=""
while IFS= read -r -d '' staged; do
  [ -f "$staged" ] || continue
  case "$staged" in
    package-lock.json|*.png|*.jpg|*.jpeg|*.webp|*.gif|*.svg|*.ico|*.zip|*.pdf|*.woff|*.woff2|*.ttf) continue ;;
  esac
  if grep -Iq . "$staged" 2>/dev/null; then
    if grep -EIl 'ghp_|github_pat_|xoxb-|whsec_|PMAK-|-----BEGIN (RSA |OPENSSH |PRIVATE )?KEY-----|TELEGRAM_BOT_TOKEN[=:][^[:space:]]+|SMTP_PASSWORD[=:][^[:space:]]+|PGPASSWORD[=:][^[:space:]]+|MYSQL_PASSWORD[=:][^[:space:]]+' "$staged" >/dev/null 2>&1; then
      SUSPEITOS="${SUSPEITOS}${staged}
"
    fi
    if grep -EI 'DATABASE_URL[=:][[:space:]]*postgres(ql)?://[^[:space:]/:@]+:[^[:space:]@]+@' "$staged" 2>/dev/null | grep -Evi 'usuario|senha|password|host|localhost|127\.0\.0\.1|exemplo|example|sua_|sua-url|seu_' >/dev/null 2>&1; then
      SUSPEITOS="${SUSPEITOS}${staged}
"
    fi
  fi
done < <(git diff --cached --name-only --diff-filter=ACMR -z)

if [ -n "$SUSPEITOS" ]; then
  echo "Possíveis segredos encontrados nestes arquivos:" | tee -a "$LOG"
  printf '%s' "$SUSPEITOS" | sort -u | tee -a "$LOG"
  git reset -q || true
  erro "commit bloqueado. Remova senhas/tokens desses arquivos e rode a limpeza novamente."
fi

ok "commit está limpo para enviar"
echo "" | tee -a "$LOG"
echo "Arquivos preparados:" | tee -a "$LOG"
git status --short | tee -a "$LOG"
echo "" | tee -a "$LOG"
echo "Agora você pode fazer:" | tee -a "$LOG"
echo "  git commit -m 'Publica Sistema Vitória Régia Pro blindado'" | tee -a "$LOG"
echo "  git push" | tee -a "$LOG"
echo "" | tee -a "$LOG"
echo "Log salvo em: $LOG" | tee -a "$LOG"
