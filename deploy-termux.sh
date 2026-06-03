#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

# CrewCheck deploy via Termux.
# Por segurança, o token NÃO fica salvo neste arquivo.
# O script pergunta usuário, repositório e token no momento do envio.

BRANCH="${BRANCH:-main}"
DEFAULT_REPO="crewcheck"

echo "🚀 CrewCheck Premium · Deploy Termux"
echo

printf "Usuário do GitHub: "
read -r GITHUB_USER
printf "Nome do repositório [${DEFAULT_REPO}]: "
read -r REPO_NAME
REPO_NAME="${REPO_NAME:-$DEFAULT_REPO}"

printf "Nome para commit do Git [CrewCheck User]: "
read -r GIT_NAME
GIT_NAME="${GIT_NAME:-CrewCheck User}"
printf "E-mail do Git [crewcheck@example.com]: "
read -r GIT_EMAIL
GIT_EMAIL="${GIT_EMAIL:-crewcheck@example.com}"

if [ -z "${GITHUB_TOKEN:-}" ]; then
  printf "Cole o token provisório do GitHub e pressione Enter: "
  read -r GITHUB_TOKEN
fi

if [ -z "$GITHUB_USER" ] || [ -z "$GITHUB_TOKEN" ]; then
  echo "Usuário ou token vazio. Deploy cancelado."
  exit 1
fi

SAFE_REPO_URL="https://github.com/${GITHUB_USER}/${REPO_NAME}.git"
PUSH_REPO_URL="https://${GITHUB_USER}:${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${REPO_NAME}.git"

git config --global user.name "$GIT_NAME"
git config --global user.email "$GIT_EMAIL"

git init
git add .
git commit -m "Atualiza CrewCheck Premium" || echo "Sem alterações novas para commit."
git branch -M "$BRANCH"
git remote remove origin 2>/dev/null || true
git remote add origin "$PUSH_REPO_URL"

git push -u origin "$BRANCH" --force

# Remove o token do remote local após o push.
git remote set-url origin "$SAFE_REPO_URL"

echo
echo "✅ Enviado para o GitHub."
echo "No Render: Manual Deploy → Clear build cache & deploy"
echo "Build Command: yarn install && yarn build"
echo "Start Command: node server.mjs"
echo
echo "⚠️ Segurança: se esse token já foi exposto em chat, revogue-o no GitHub e gere outro."
