#!/usr/bin/env bash
set -euo pipefail

# Aplicador padrão Vitória Régia para Android/Termux
# ZIP padrão: /storage/emulated/0/Download/vitoriaregia_update.zip
# Repositório: https://github.com/bmedeiros1987/vitoriaregia1.git

DOWNLOAD_DIR="/storage/emulated/0/Download"
ZIP_PADRAO="${DOWNLOAD_DIR}/vitoriaregia_update.zip"
ZIP_FILE="${1:-$ZIP_PADRAO}"
GIT_REPO_URL="${GIT_REPO_URL:-https://github.com/bmedeiros1987/vitoriaregia1.git}"
BRANCH="${BRANCH:-main}"
WORKDIR="${WORKDIR:-$HOME/vitoriaregia1_upload_work}"
REPO_DIR="$WORKDIR/repositorio"
TMP_DIR="$WORKDIR/update_extraido"
COMMIT_MSG="${COMMIT_MSG:-Update completo Vitória Régia}"

command_exists() { command -v "$1" >/dev/null 2>&1; }

if [ ! -f "$ZIP_FILE" ]; then
  echo "❌ ZIP não encontrado: $ZIP_FILE"
  echo "Coloque o arquivo como: $ZIP_PADRAO"
  exit 1
fi

if command_exists termux-setup-storage; then
  termux-setup-storage >/dev/null 2>&1 || true
fi

if command_exists pkg; then
  echo "📦 Conferindo dependências no Termux..."
  pkg install git unzip rsync nodejs-lts -y >/dev/null || pkg install git unzip rsync nodejs -y >/dev/null || true
fi

for cmd in git unzip rsync; do
  if ! command_exists "$cmd"; then
    echo "❌ Dependência ausente: $cmd"
    echo "No Termux, instale com: pkg install git unzip rsync nodejs-lts -y"
    exit 1
  fi
done

if ! command_exists node; then
  echo "⚠️ Node.js não encontrado. A atualização será copiada, mas a injeção automática pode não rodar."
fi

echo "🧹 Preparando cópia limpa para evitar erro non-fast-forward..."
rm -rf "$WORKDIR"
mkdir -p "$WORKDIR" "$TMP_DIR"

echo "📥 Clonando repositório atualizado..."
git clone --branch "$BRANCH" "$GIT_REPO_URL" "$REPO_DIR"

echo "📂 Extraindo update: $ZIP_FILE"
unzip -q "$ZIP_FILE" -d "$TMP_DIR"

if [ -d "$TMP_DIR/substituir-no-repositorio" ]; then
  SRC_DIR="$TMP_DIR/substituir-no-repositorio"
else
  FIRST_DIR="$(find "$TMP_DIR" -mindepth 1 -maxdepth 1 -type d | head -n 1 || true)"
  FIRST_COUNT="$(find "$TMP_DIR" -mindepth 1 -maxdepth 1 | wc -l | tr -d ' ')"
  if [ -n "$FIRST_DIR" ] && [ "$FIRST_COUNT" = "1" ] && [ -d "$FIRST_DIR/substituir-no-repositorio" ]; then
    SRC_DIR="$FIRST_DIR/substituir-no-repositorio"
  elif [ -n "$FIRST_DIR" ] && [ "$FIRST_COUNT" = "1" ]; then
    SRC_DIR="$FIRST_DIR"
  else
    SRC_DIR="$TMP_DIR"
  fi
fi

echo "📌 Origem aplicada: $SRC_DIR"
rsync -a "$SRC_DIR"/ "$REPO_DIR"/

cd "$REPO_DIR"

# Remove segredos que nunca devem ir para GitHub.
find . -type f \( -name ".env" -o -name "*.env" -o -name "*.pem" -o -name "*.key" -o -name "*.crt" \) -delete 2>/dev/null || true

if command_exists node && [ -f "instalar_update_completo.js" ]; then
  echo "🧩 Ativando update no index.html e no backend..."
  node instalar_update_completo.js
else
  echo "⚠️ instalar_update_completo.js não executado. Verifique se Node.js está instalado."
fi

git config user.name "Bruno Saraiva" || true
git config user.email "bmedeiros1987@gmail.com" || true

echo "🔎 Status das alterações:"
git status --short

if git diff --quiet && git diff --cached --quiet; then
  echo "ℹ️ Nenhuma alteração nova para enviar."
  exit 0
fi

echo "📝 Criando commit..."
git add -A
git commit -m "$COMMIT_MSG" || echo "ℹ️ Nada novo para commit."

echo "🚀 Enviando para o GitHub..."
git pull --rebase origin "$BRANCH" || true
git push origin "$BRANCH"

echo "✅ Update enviado para o GitHub. Se o Render estiver conectado, o deploy deve iniciar automaticamente."
