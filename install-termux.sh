#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail

VERSION="v6.2 Pro AutoDB"
APP_NAME="vitoriaregia-pro"
TARGET="$HOME/$APP_NAME"
PORT_APP="3000"
LOCAL_DB_NAME="vitoriaregia"
LOCAL_DB_USER="vitoriaregia"
LOCAL_DB_PASS="vitoriaregia123"
LOG="/storage/emulated/0/Download/vitoriaregia_pro_instalacao.log"
CANDIDATE_FILE="$HOME/.vitoriaregia_database_url_candidates_$$.tmp"

mkdir -p "$(dirname "$LOG")" 2>/dev/null || true
: > "$LOG" 2>/dev/null || LOG="$HOME/vitoriaregia_pro_instalacao.log"

banner(){ echo ""; echo "============================================================"; echo "  Sistema Vitória Régia Pro $VERSION - Instalador Termux"; echo "============================================================"; echo ""; }
step(){ echo "▶ $1" | tee -a "$LOG"; }
warn(){ echo "AVISO: $1" | tee -a "$LOG"; }
erro(){ echo "" | tee -a "$LOG"; echo "ERRO: $1" | tee -a "$LOG"; echo "Log salvo em: $LOG" | tee -a "$LOG"; rm -f "$CANDIDATE_FILE" "$CANDIDATE_FILE.uniq" 2>/dev/null || true; exit 1; }

mask_database_url(){
  local value="${1:-}"
  printf '%s' "$value" | sed -E 's#(postgres(ql)?://[^:/@[:space:]]+:)[^@[:space:]]+@#\1***@#g; s#(mysql://[^:/@[:space:]]+:)[^@[:space:]]+@#\1***@#g'
}

clean_env_value(){
  local value="${1:-}"
  value="$(printf '%s' "$value" | tr -d '\r' | sed -E "s/^[[:space:]]*//; s/[[:space:]]*$//; s/^['\"]//; s/['\"]$//")"
  printf '%s' "$value"
}

parse_database_url_line(){
  local line="${1:-}" value=""
  line="$(printf '%s' "$line" | tr -d '\r' | sed -E 's/^[[:space:]]*export[[:space:]]+//; s/^[[:space:]]*//; s/[[:space:]]*$//')"
  line="${line%%#*}"
  case "$line" in
    DATABASE_URL=*) value="${line#DATABASE_URL=}" ;;
    DATABASE_URL:*) value="${line#DATABASE_URL:}" ;;
    *) return 1 ;;
  esac
  clean_env_value "$value"
}

parse_database_ssl_line(){
  local line="${1:-}" value=""
  line="$(printf '%s' "$line" | tr -d '\r' | sed -E 's/^[[:space:]]*export[[:space:]]+//; s/^[[:space:]]*//; s/[[:space:]]*$//')"
  line="${line%%#*}"
  case "$line" in
    DATABASE_SSL=*) value="${line#DATABASE_SSL=}" ;;
    DATABASE_SSL:*) value="${line#DATABASE_SSL:}" ;;
    *) return 1 ;;
  esac
  clean_env_value "$value"
}

is_valid_database_url(){
  local value="${1:-}" lower
  lower="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"
  case "$lower" in
    postgres://*|postgresql://*) ;;
    *) return 1 ;;
  esac
  case "$value" in
    *\$*|*usuario*|*senha@host*|*sua_url*|*sua-url*|*host:5432/database*|*host:porta/banco*|*exemplo*|*example*) return 1 ;;
  esac
  [ "${#value}" -gt 20 ] || return 1
  return 0
}

read_database_ssl_from_file(){
  local file="${1:-}" line value
  [ -f "$file" ] || return 1
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      *DATABASE_SSL*)
        value="$(parse_database_ssl_line "$line" 2>/dev/null || true)"
        case "$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')" in
          true|false) printf '%s' "$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"; return 0 ;;
        esac
      ;;
    esac
  done < "$file"
  return 1
}

guess_database_ssl(){
  local url="${1:-}" lower
  lower="$(printf '%s' "$url" | tr '[:upper:]' '[:lower:]')"
  case "$lower" in
    *sslmode=disable*|*localhost*|*127.0.0.1*) echo "false" ;;
    *sslmode=require*|*render.com*|*neon.tech*|*supabase.co*|*railway.app*|*amazonaws.com*) echo "true" ;;
    *) echo "true" ;;
  esac
}

scan_previous_database_urls(){
  : > "$CANDIDATE_FILE"
  local root file line url
  for root in "$HOME" "/storage/emulated/0/Download"; do
    [ -d "$root" ] || continue
    while IFS= read -r file; do
      [ -f "$file" ] || continue
      while IFS= read -r line || [ -n "$line" ]; do
        case "$line" in
          *DATABASE_URL*)
            url="$(parse_database_url_line "$line" 2>/dev/null || true)"
            if is_valid_database_url "$url"; then
              printf '%s\t%s\n' "$url" "$file" >> "$CANDIDATE_FILE"
            fi
          ;;
        esac
      done < "$file"
    done < <(find "$root" \
      \( -path '*/node_modules' -o -path '*/.git' -o -path '*/client/dist' -o -path '*/dist' -o -path '*/.npm' \) -prune -o \
      -type f \( -name '.env' -o -name '.env.*' -o -name '*.env' -o -name 'render.yaml' -o -name 'docker-compose.yml' -o -name 'docker-compose.yaml' \) -print 2>/dev/null)
  done
  if [ -s "$CANDIDATE_FILE" ]; then
    awk -F '\t' '!seen[$1]++' "$CANDIDATE_FILE" > "$CANDIDATE_FILE.uniq" && mv "$CANDIDATE_FILE.uniq" "$CANDIDATE_FILE"
  fi
}

choose_previous_database_url(){
  SELECTED_DATABASE_URL=""
  SELECTED_DATABASE_FILE=""
  [ -s "$CANDIDATE_FILE" ] || return 1

  local count idx line url file choice reply
  count="$(wc -l < "$CANDIDATE_FILE" | tr -d ' ')"
  echo ""
  echo "Encontrei DATABASE_URL anterior no aparelho. Por segurança, a senha fica mascarada:"
  idx=1
  while IFS=$'\t' read -r url file; do
    echo "  $idx) $(mask_database_url "$url")"
    echo "     origem: $file"
    idx=$((idx+1))
  done < "$CANDIDATE_FILE"

  if [ "$count" = "1" ]; then
    read -r -p "Usar essa DATABASE_URL automaticamente? [S/n]: " reply
    reply="${reply:-S}"
    case "$reply" in n|N|nao|não) return 1 ;; esac
    IFS=$'\t' read -r SELECTED_DATABASE_URL SELECTED_DATABASE_FILE < "$CANDIDATE_FILE"
    return 0
  fi

  read -r -p "Escolha o número da DATABASE_URL para usar [1]: " choice
  choice="${choice:-1}"
  case "$choice" in ''|*[!0-9]*) return 1 ;; esac
  [ "$choice" -ge 1 ] 2>/dev/null && [ "$choice" -le "$count" ] 2>/dev/null || return 1
  line="$(sed -n "${choice}p" "$CANDIDATE_FILE")"
  SELECTED_DATABASE_URL="${line%%$'\t'*}"
  SELECTED_DATABASE_FILE="${line#*$'\t'}"
  return 0
}

manual_database_url(){
  local value
  echo "Cole a DATABASE_URL do banco anterior/remoto."
  echo "Exemplo: postgres://usuario:senha@host:5432/database?sslmode=require"
  read -r -p "DATABASE_URL: " value
  value="$(clean_env_value "$value")"
  [ -n "$value" ] || erro "DATABASE_URL vazia. Rode novamente ou escolha banco local."
  is_valid_database_url "$value" || erro "DATABASE_URL inválida ou parecida com exemplo. Cole a URL real do PostgreSQL."
  DATABASE_URL_VALUE="$value"
  read -r -p "Usar SSL no banco? [S/n]: " SSL_REPLY
  SSL_REPLY="${SSL_REPLY:-S}"
  case "$SSL_REPLY" in n|N|nao|não) DATABASE_SSL_VALUE="false" ;; *) DATABASE_SSL_VALUE="true" ;; esac
}

termux_repo_help(){
  cat <<'HELP' | tee -a "$LOG"

O Termux recusou atualização/instalação de pacotes por assinatura ou espelho.
Isso normalmente se resolve trocando o mirror oficial e limpando o cache.

Faça no Termux:

  termux-change-repo

Na tela que abrir:
  1. marque Main repository
  2. escolha outro mirror oficial
  3. confirme

Depois rode:

  rm -rf $PREFIX/var/lib/apt/lists/*
  pkg update -y

Se continuar falhando e seu Termux veio da Play Store ou é muito antigo,
instale/atualize o Termux pelo F-Droid ou GitHub oficial e rode este instalador de novo.
HELP
}

try_repair_termux_repo(){
  echo "" | tee -a "$LOG"
  warn "pkg update falhou. Vou tentar abrir a troca de repositório do Termux."
  if command -v termux-change-repo >/dev/null 2>&1; then
    echo "Quando a tela abrir, selecione Main repository e escolha outro mirror oficial." | tee -a "$LOG"
    read -r -p "Abrir termux-change-repo agora? [S/n]: " OPEN_REPO
    OPEN_REPO="${OPEN_REPO:-S}"
    case "$OPEN_REPO" in
      n|N|nao|não) ;;
      *) termux-change-repo || true ;;
    esac
  else
    warn "termux-change-repo não está disponível neste Termux."
  fi
  rm -rf "$PREFIX/var/lib/apt/lists"/* 2>/dev/null || true
  pkg update -y >> "$LOG" 2>&1
}

unique_packages(){
  printf '%s\n' "$@" | awk 'NF && !seen[$0]++'
}

install_required_packages(){
  local packages=() unique_list missing_text

  if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    packages+=("nodejs-lts")
  fi

  if [ "${DB_OPTION:-1}" = "3" ]; then
    if ! command -v initdb >/dev/null 2>&1 || ! command -v pg_ctl >/dev/null 2>&1 || ! command -v psql >/dev/null 2>&1 || ! command -v createdb >/dev/null 2>&1; then
      packages+=("postgresql")
    fi
  fi

  if [ "${#packages[@]}" -eq 0 ]; then
    echo "OK: Node/NPM já disponíveis. Não vou mexer no apt/pkg." | tee -a "$LOG"
    return 0
  fi

  mapfile -t unique_list < <(unique_packages "${packages[@]}")
  missing_text="${unique_list[*]}"
  step "Instalando pacotes necessários: $missing_text"

  if ! pkg update -y >> "$LOG" 2>&1; then
    if ! try_repair_termux_repo; then
      termux_repo_help
      erro "falha ao atualizar o Termux. Corrija o repositório e rode o instalador novamente."
    fi
  fi

  if ! pkg install -y "${unique_list[@]}" >> "$LOG" 2>&1; then
    termux_repo_help
    erro "falha ao instalar pacotes: $missing_text"
  fi
}

banner | tee -a "$LOG"
step "Conferindo fonte do sistema"
BASE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -d "$BASE/sistema" ] && [ -f "$BASE/sistema/package.json" ]; then
  SRC="$BASE/sistema"
elif [ -f "$BASE/package.json" ]; then
  SRC="$BASE"
else
  erro "não encontrei a pasta sistema nem package.json ao lado deste instalador. Extraia o ZIP completo antes de rodar."
fi

step "Procurando DATABASE_URL da versão anterior antes de substituir arquivos"
scan_previous_database_urls || true
if [ -s "$CANDIDATE_FILE" ]; then
  echo "OK: encontrei possível DATABASE_URL anterior." | tee -a "$LOG"
else
  echo "Não encontrei DATABASE_URL real em .env antigo. Vou permitir colar manualmente." | tee -a "$LOG"
fi

cat <<MSG
Banco de dados:
1) Puxar automaticamente DATABASE_URL da versão anterior encontrada no Termux/celular
2) Colar DATABASE_URL manualmente
3) Criar banco local no próprio Termux
MSG
read -r -p "Escolha [1/2/3, padrão 1]: " DB_OPTION
DB_OPTION="${DB_OPTION:-1}"

SELECTED_DATABASE_URL=""
SELECTED_DATABASE_FILE=""
DATABASE_URL_VALUE=""
DATABASE_SSL_VALUE="true"

case "$DB_OPTION" in
  2)
    manual_database_url
  ;;
  3)
    echo "Banco local escolhido. Vou precisar do pacote postgresql do Termux." | tee -a "$LOG"
  ;;
  1|*)
    DB_OPTION="1"
    if choose_previous_database_url; then
      DATABASE_URL_VALUE="$SELECTED_DATABASE_URL"
      DATABASE_SSL_VALUE="$(read_database_ssl_from_file "$SELECTED_DATABASE_FILE" 2>/dev/null || guess_database_ssl "$DATABASE_URL_VALUE")"
      echo "DATABASE_URL anterior aplicada: $(mask_database_url "$DATABASE_URL_VALUE")" | tee -a "$LOG"
    else
      echo "Não foi possível usar automaticamente a DATABASE_URL anterior."
      manual_database_url
      DB_OPTION="2"
    fi
  ;;
esac

install_required_packages

step "Preparando pasta $TARGET"
rm -rf "$TARGET"
mkdir -p "$TARGET"
cp -a "$SRC"/. "$TARGET"/ >> "$LOG" 2>&1 || erro "falha ao copiar o sistema"
cd "$TARGET" || erro "não consegui entrar em $TARGET"

if [ "$DB_OPTION" = "3" ]; then
  step "Inicializando PostgreSQL local"
  if [ ! -d "$PREFIX/var/lib/postgresql" ] || [ -z "$(ls -A "$PREFIX/var/lib/postgresql" 2>/dev/null || true)" ]; then
    initdb "$PREFIX/var/lib/postgresql" >> "$LOG" 2>&1 || erro "falha ao inicializar PostgreSQL"
  fi
  pg_ctl -D "$PREFIX/var/lib/postgresql" -l "$PREFIX/var/lib/postgresql/logfile" start >> "$LOG" 2>&1 || true
  sleep 2
  createdb "$LOCAL_DB_NAME" >> "$LOG" 2>&1 || true
  psql -d "$LOCAL_DB_NAME" -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$LOCAL_DB_USER') THEN CREATE ROLE $LOCAL_DB_USER LOGIN PASSWORD '$LOCAL_DB_PASS'; END IF; END \$\$;" >> "$LOG" 2>&1 || true
  psql -d "$LOCAL_DB_NAME" -c "GRANT ALL PRIVILEGES ON DATABASE $LOCAL_DB_NAME TO $LOCAL_DB_USER; GRANT ALL ON SCHEMA public TO $LOCAL_DB_USER;" >> "$LOG" 2>&1 || true
  DATABASE_URL_VALUE="postgres://$LOCAL_DB_USER:$LOCAL_DB_PASS@localhost:5432/$LOCAL_DB_NAME"
  DATABASE_SSL_VALUE="false"
fi

[ -n "$DATABASE_URL_VALUE" ] || erro "DATABASE_URL não definida"

step "Criando server/.env sem expor senha no log"
mkdir -p server
JWT_VALUE="vitoria-regia-pro-$(date +%s)-$RANDOM"
cat > server/.env <<ENV
PORT=$PORT_APP
DATABASE_URL=$DATABASE_URL_VALUE
DATABASE_SSL=$DATABASE_SSL_VALUE
JWT_SECRET=$JWT_VALUE
JWT_EXPIRES=12h
ADMIN_EMAIL=admin@vitoriaregia.local
ADMIN_PASSWORD=123456
APP_VERSION=Vitória Régia Pro v6.2 AutoDB Termux
CORS_ORIGIN=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
SMTP_HOST=smtp.mailersend.net
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
MAIL_FROM=Condomínio Vitória Régia <no-reply@vitoriaregia.local>
ENV
chmod 600 server/.env

step "Instalando dependências Node.js"
npm install >> "$LOG" 2>&1 || erro "falha ao instalar dependências"

step "Gerando frontend de produção"
npm run build >> "$LOG" 2>&1 || erro "falha ao gerar build"

step "Criando atalho de inicialização"
cat > iniciar-vitoria-regia-pro.sh <<'RUN'
#!/data/data/com.termux/files/usr/bin/bash
set -e
cd "$HOME/vitoriaregia-pro"
if command -v pg_ctl >/dev/null 2>&1 && [ -d "$PREFIX/var/lib/postgresql" ]; then
  pg_ctl -D "$PREFIX/var/lib/postgresql" -l "$PREFIX/var/lib/postgresql/logfile" start >/dev/null 2>&1 || true
fi
npm start
RUN
chmod +x iniciar-vitoria-regia-pro.sh
rm -f "$CANDIDATE_FILE" "$CANDIDATE_FILE.uniq" 2>/dev/null || true

banner | tee -a "$LOG"
echo "Instalação concluída." | tee -a "$LOG"
echo "Pasta: $TARGET" | tee -a "$LOG"
echo "Acesse: http://localhost:$PORT_APP" | tee -a "$LOG"
echo "Login: admin@vitoriaregia.local" | tee -a "$LOG"
echo "Senha: 123456" | tee -a "$LOG"
echo "Banco aplicado: $(mask_database_url "$DATABASE_URL_VALUE")" | tee -a "$LOG"
echo "Para iniciar depois:" | tee -a "$LOG"
echo "  cd $TARGET && ./iniciar-vitoria-regia-pro.sh" | tee -a "$LOG"
echo "" | tee -a "$LOG"
read -r -p "Iniciar o sistema agora? [S/n]: " START_NOW
START_NOW="${START_NOW:-S}"
case "$START_NOW" in
  n|N|nao|não) exit 0 ;;
  *) ./iniciar-vitoria-regia-pro.sh ;;
esac
