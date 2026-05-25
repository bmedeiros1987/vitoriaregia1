#!/usr/bin/env bash
set -euo pipefail

echo "===== Notificar atualização Vitória Régia Pro v9.4 ====="
read -r -p "URL do sistema no Render (ex: https://vitoriaregia.onrender.com): " APP_URL
APP_URL="${APP_URL%/}"
read -rs -p "UPDATE_ANNOUNCE_TOKEN configurado no Render: " UPDATE_TOKEN; echo ""
[ -n "$APP_URL" ] || { echo "URL vazia"; exit 1; }
[ -n "$UPDATE_TOKEN" ] || { echo "Token vazio"; exit 1; }

curl -fsS -X POST "$APP_URL/api/system-updates/announce"   -H "Content-Type: application/json"   -H "x-update-token: $UPDATE_TOKEN"   --data @- <<'JSON'
{
  "system": "vitoria-regia-pro",
  "update_code": "VRUPD-9.2-20260525-OFICIAL",
  "version": "Vitória Régia Pro v9.4",
  "from_version": "v9.1",
  "to_version": "v9.4",
  "title": "Central de Atualizações disponível",
  "notes": "Nova versão com atualização por ZIP assinado, token único por pacote, validação de checksum e aviso interno para o Master.",
  "channel": "stable"
}
JSON

echo
echo "Notificação enviada. Entre como Master e abra: Atualizações."
