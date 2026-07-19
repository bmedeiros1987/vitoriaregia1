#!/usr/bin/env sh
set -eu

export npm_config_registry="https://registry.npmjs.org/"
export npm_config_audit="false"
export npm_config_fund="false"
export npm_config_update_notifier="false"
export LANG="${LANG:-C.UTF-8}"
export LC_ALL="${LC_ALL:-C.UTF-8}"
export PGCLIENTENCODING="${PGCLIENTENCODING:-UTF8}"
export APP_VERSION="${APP_VERSION:-Vitória Régia One v14.0.4}"
export VITE_APP_VERSION="${VITE_APP_VERSION:-Vitória Régia One v14.0.4}"

printf '\n==> Instalando dependências da raiz...\n'
npm install --ignore-scripts --no-audit --no-fund --legacy-peer-deps

printf '\n==> Instalando dependências do cliente...\n'
npm --prefix client install --include=dev --no-audit --no-fund --legacy-peer-deps

printf '\n==> Instalando dependências do servidor...\n'
npm --prefix server install --include=dev --no-audit --no-fund --legacy-peer-deps

printf '\n==> Compilando cliente...\n'
npm --prefix client run build

printf '\n==> Validando chamadas, RSVP, exclusões, boot, layout, OCR e UTF-8...\n'
node --check server/src/telegram-call-context.mjs
node --check server/src/telegram-call-details-preload.mjs
node --check server/src/telegram-concierge-data.mjs
node --check server/src/telegram-concierge-audio.mjs
node --check server/src/telegram-concierge-preload.mjs
node --check server/src/reservation-rsvp-lib.mjs
node --check server/src/reservation-rsvp-service.mjs
node --check server/src/reservation-rsvp-preload.mjs
node --check server/src/package-reminders-preload.mjs
node --check server/src/deletion-governance-preload.mjs
node --check server/src/package-ocr-intelligence-preload.mjs
node --check server/src/runtime-secret-alignment-preload.mjs
node --check client/public/telegram-call-details-ui.js
node --check client/public/mobile-stability-v12-9-2.js
node --check client/public/package-intelligence-v14.js
node --check client/public/reservation-rsvp-public-v14.js
node --check client/public/reservation-rsvp-manager-v14.js
node --check client/public/deletion-governance-v14.js

printf '\n==> Validando servidor...\n'
npm --prefix server run build

printf '\n==> Publicando arquivos web no servidor...\n'
rm -rf server/public
mkdir -p server/public
cp -a client/dist/. server/public/

printf '\n==> Build concluído com sucesso.\n'
