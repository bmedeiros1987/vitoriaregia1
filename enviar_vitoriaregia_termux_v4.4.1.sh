#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
APP_VERSION="v4.4.1"
GITHUB_USER="bmedeiros1987"
REPO_NAME="vitoriaregia1"
REPO_URL="https://github.com/${GITHUB_USER}/${REPO_NAME}.git"
DOWNLOAD_DIR="/storage/emulated/0/Download"
ZIP_VERSIONED="${DOWNLOAD_DIR}/vitoriaregia_update_${APP_VERSION}.zip"
ZIP_DEFAULT="${DOWNLOAD_DIR}/vitoriaregia_update.zip"
WORK_ROOT="${HOME}/vitoriaregia_termux_envio_${APP_VERSION}"
REPO_DIR="${WORK_ROOT}/${REPO_NAME}"
EXTRACT_DIR="${WORK_ROOT}/update_extraido"
LOG_FILE="${DOWNLOAD_DIR}/vitoriaregia_envio_${APP_VERSION}.log"
check_cmd(){ command -v "$1" >/dev/null 2>&1 || { echo "Instale: pkg install $1 -y"; exit 1; }; }
check_cmd git; check_cmd unzip; check_cmd rsync; check_cmd node
[ -f "$ZIP_VERSIONED" ] && ZIP_FILE="$ZIP_VERSIONED" || ZIP_FILE="$ZIP_DEFAULT"
[ -f "$ZIP_FILE" ] || { echo "Coloque o ZIP em $ZIP_VERSIONED"; exit 1; }
rm -rf "$WORK_ROOT"; mkdir -p "$WORK_ROOT" "$EXTRACT_DIR"
unzip -q "$ZIP_FILE" -d "$EXTRACT_DIR"
SOURCE_DIR="$EXTRACT_DIR"; [ -d "$EXTRACT_DIR/substituir-no-repositorio" ] && SOURCE_DIR="$EXTRACT_DIR/substituir-no-repositorio"
ITEM_COUNT=$(find "$SOURCE_DIR" -mindepth 1 -maxdepth 1 | wc -l | tr -d ' ')
if [ "$ITEM_COUNT" = "1" ]; then ONLY_ITEM=$(find "$SOURCE_DIR" -mindepth 1 -maxdepth 1 | head -n 1); [ -d "$ONLY_ITEM" ] && [ -f "$ONLY_ITEM/index.html" ] && SOURCE_DIR="$ONLY_ITEM"; fi
[ -f "$SOURCE_DIR/index.html" ] || { echo "index.html não encontrado"; exit 1; }
[ -f "$SOURCE_DIR/backend/src/server.js" ] || { echo "backend/src/server.js não encontrado"; exit 1; }
ZIP_VERSION_FOUND=$(node -e "try{const fs=require('fs');const v=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));console.log(v.version||'')}catch(e){}" "$SOURCE_DIR/VERSION.json")
[ "$ZIP_VERSION_FOUND" = "$APP_VERSION" ] || { echo "Versão errada. Esperado $APP_VERSION, encontrado $ZIP_VERSION_FOUND"; exit 1; }
git clone --depth=1 "$REPO_URL" "$REPO_DIR" >> "$LOG_FILE" 2>&1
rsync -a --delete "$SOURCE_DIR/" "$REPO_DIR/" --exclude=".git"
cd "$REPO_DIR"
node --check backend/src/server.js >> "$LOG_FILE" 2>&1 || { echo "Erro de sintaxe backend"; exit 1; }
git config user.name "Bruno Saraiva"; git config user.email "bmedeiros1987@gmail.com"
git add .
git commit -m "Correção Vitória Régia ${APP_VERSION}" >> "$LOG_FILE" 2>&1 || true
TOKEN_FILE="${DOWNLOAD_DIR}/.github_token_vitoriaregia"
if [ -n "${GITHUB_TOKEN_TEMP:-}" ]; then GITHUB_TOKEN="$GITHUB_TOKEN_TEMP"; elif [ -f "$TOKEN_FILE" ]; then GITHUB_TOKEN="$(cat "$TOKEN_FILE" | tr -d '\r\n')"; else read -s -p "Cole seu token NOVO do GitHub: " GITHUB_TOKEN; echo ""; fi
[ -n "$GITHUB_TOKEN" ] || { echo "Token vazio"; exit 1; }
git remote set-url origin "https://${GITHUB_USER}:${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${REPO_NAME}.git"
git push origin main >> "$LOG_FILE" 2>&1
git remote set-url origin "$REPO_URL"; unset GITHUB_TOKEN; unset GITHUB_TOKEN_TEMP
[ -f "$TOKEN_FILE" ] && rm -f "$TOKEN_FILE"
find "$DOWNLOAD_DIR" -maxdepth 1 -type f -name "vitoriaregia_update_v*.zip" ! -name "vitoriaregia_update_${APP_VERSION}.zip" -delete || true
find "$DOWNLOAD_DIR" -maxdepth 1 -type f -name "enviar_vitoriaregia_termux_v*.sh" ! -name "enviar_vitoriaregia_termux_${APP_VERSION}.sh" -delete || true
find "$DOWNLOAD_DIR" -maxdepth 1 -type f -name "vitoriaregia_termux_upload_v*.zip" ! -name "vitoriaregia_termux_upload_${APP_VERSION}.zip" -delete || true
cp -f "$ZIP_VERSIONED" "$ZIP_DEFAULT" 2>/dev/null || true
echo "Envio concluído. Faça Manual Deploy no Render se não usar deploy hook."
