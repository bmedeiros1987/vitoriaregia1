# CrewCheck com MySQL/Aiven

Esta versão aceita `DATABASE_URL` em formato MySQL, ideal para Aiven.

## Variáveis no Render

Use:

```env
NODE_VERSION=22.13.0
NODE_ENV=production
DATABASE_URL=mysql://avnadmin:SUA_SENHA@mysql-1c3b1be8-vitoriaregia1.a.aivencloud.com:22966/defaultdb?ssl-mode=REQUIRED
MYSQL_SSL_MODE=REQUIRED
CREWCHECK_AUTO_MIGRATE=true
CREWCHECK_AUTH_REQUIRED=true
APP_URL=https://crewcheck.onrender.com
EMAIL_FROM_NAME=CrewCheck
MAILERSEND_API_KEY=sua_chave_mailersend
MAILERSEND_FROM=seu_remetente_mailersend
```

No campo `Value` do Render, cole a URL em uma única linha, sem aspas, sem crase e sem `DATABASE_URL=`.

## O que o servidor cria automaticamente

- `crewcheck_users`
- `crewcheck_sessions`
- `crewcheck_rosters`
- `crewcheck_audit_logs`

A criação ocorre no primeiro deploy quando `CREWCHECK_AUTO_MIGRATE=true`.

## Teste

Após o deploy, abra:

```text
https://crewcheck.onrender.com/api/db/status
```

O retorno esperado é `connected: true`.
