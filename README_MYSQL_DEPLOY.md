# CrewCheck Premium · MySQL/Aiven

Esta versão foi migrada para MySQL/Aiven usando `DATABASE_URL=mysql://...` no backend Node.

## Render

Build Command:

```bash
yarn install && yarn build
```

Start Command:

```bash
node server.mjs
```

Variáveis principais:

```env
NODE_VERSION=22.13.0
NODE_ENV=production
DATABASE_URL=mysql://avnadmin:SUA_SENHA@mysql-1c3b1be8-vitoriaregia1.a.aivencloud.com:22966/defaultdb?ssl-mode=REQUIRED
MYSQL_SSL_MODE=REQUIRED
CREWCHECK_AUTO_MIGRATE=true
CREWCHECK_AUTH_REQUIRED=true
APP_URL=https://crewcheck.onrender.com
EMAIL_FROM_NAME=CrewCheck
MAILERSEND_API_KEY=sua_chave
MAILERSEND_FROM=seu_remetente
```

No Render, cole o valor de `DATABASE_URL` em uma única linha. Não use `PGSSLMODE`, `PGUSER`, `PGPASSWORD`, `PGHOST`, `POSTGRES_URL` nem URLs antigas do Supabase.

## Teste

Depois do deploy:

```text
https://crewcheck.onrender.com/api/db/status
```

O retorno deve trazer `connected: true` e `engine: mysql`.

## Segurança

Não grave credenciais no GitHub. Use sempre variáveis de ambiente do Render.
