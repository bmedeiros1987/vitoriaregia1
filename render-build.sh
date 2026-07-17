#!/usr/bin/env sh
set -eu

export npm_config_registry="https://registry.npmjs.org/"
export npm_config_audit="false"
export npm_config_fund="false"
export npm_config_update_notifier="false"

printf '\n==> Instalando dependências da raiz...\n'
npm install --ignore-scripts --no-audit --no-fund --legacy-peer-deps

printf '\n==> Instalando dependências do cliente...\n'
npm --prefix client install --include=dev --no-audit --no-fund --legacy-peer-deps

printf '\n==> Instalando dependências do servidor...\n'
npm --prefix server install --include=dev --no-audit --no-fund --legacy-peer-deps

printf '\n==> Compilando cliente...\n'
npm --prefix client run build

printf '\n==> Validando servidor...\n'
npm --prefix server run build

printf '\n==> Publicando arquivos web no servidor...\n'
rm -rf server/public
mkdir -p server/public
cp -a client/dist/. server/public/

printf '\n==> Build concluído com sucesso.\n'
