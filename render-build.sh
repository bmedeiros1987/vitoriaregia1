#!/usr/bin/env sh
set -eu

export npm_config_registry="https://registry.npmjs.org/"
export npm_config_audit="false"
export npm_config_fund="false"
export npm_config_update_notifier="false"
export LANG="${LANG:-C.UTF-8}"
export LC_ALL="${LC_ALL:-C.UTF-8}"
export PGCLIENTENCODING="${PGCLIENTENCODING:-UTF8}"

printf '\n==> Instalando dependências da raiz...\n'
npm install --ignore-scripts --no-audit --no-fund --legacy-peer-deps

printf '\n==> Instalando dependências do cliente...\n'
npm --prefix client install --include=dev --no-audit --no-fund --legacy-peer-deps

printf '\n==> Instalando dependências do servidor...\n'
npm --prefix server install --include=dev --no-audit --no-fund --legacy-peer-deps

printf '\n==> Compilando cliente...\n'
npm --prefix client run build

printf '\n==> Validando chamadas contextuais e UTF-8...\n'
node --check server/src/telegram-call-context.mjs
node --check server/src/telegram-call-details-preload.mjs
node --check client/public/telegram-call-details-ui.js

printf '\n==> Validando servidor...\n'
npm --prefix server run build

printf '\n==> Publicando arquivos web no servidor...\n'
rm -rf server/public
mkdir -p server/public
cp -a client/dist/. server/public/

printf '\n==> Build concluído com sucesso.\n'
