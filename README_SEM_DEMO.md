# Versão operacional sem modo demo

Esta versão foi ajustada para trabalhar somente com backend + PostgreSQL.

## O que foi removido/desativado

- População automática de dados fictícios.
- Botão antigo de reset demo.
- Login local sem validação de backend.
- Acesso de síndico/portaria por e-mail vazio.
- Fallback de salvamento em arquivo quando `REQUIRE_DATABASE=true`.
- Rota `/auth/demo` desativada por padrão.

## Variáveis obrigatórias no Render

```env
REQUIRE_DATABASE=true
AUTO_INIT_DB=true
REQUIRE_APPROVED_RESIDENT=true
ALLOW_LEGACY_DEMO_LOGIN=false

PGHOST=vitoriaregia1-vitoriaregia1.f.aivencloud.com
PGPORT=22968
PGDATABASE=vitoriaregia1
PGUSER=bmedeiros1987@gmail.com
PGPASSWORD=SENHA_REAL_DO_BANCO_AIVEN
PGSSLMODE=require
PGSSL_REJECT_UNAUTHORIZED=false

ADMIN_EMAILS=bmedeiros1987@gmail.com
```

## Comandos no Render

```bash
Build Command: cd backend && npm install
Start Command: cd backend && npm start
```

## Teste após deploy

Abra:

```text
https://SEU-SITE.onrender.com/api/db/status
```

O esperado é `ok: true`, `ready: true` e `mode: "postgresql"`.
