#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/sistema"
[ -f .env ] || cp .env.example .env
npm install --no-audit --no-fund
npm run build
npm start
