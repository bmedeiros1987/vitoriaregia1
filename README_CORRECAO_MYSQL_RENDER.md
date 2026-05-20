# Correção MySQL/Aiven no Render

Esta versão corrige o erro:

```text
Cannot read properties of undefined (reading '0')
```

O problema estava no adaptador MySQL do backend. A conexão era criada corretamente na primeira consulta, mas as consultas seguintes passavam a retornar o formato bruto do `mysql2`, o que fazia o sistema tentar acessar `result.rows[0]` quando `rows` ainda não existia.

## Configuração no Render

Use:

```bash
Build Command:
cd backend && npm install
```

```bash
Start Command:
cd backend && npm start
```

Variáveis principais:

```env
DATABASE_PROVIDER=mysql
REQUIRE_DATABASE=true
AUTO_INIT_DB=true

MYSQL_HOST=mysql-1c3b1be8-vitoriaregia1.a.aivencloud.com
MYSQL_PORT=22966
MYSQL_DATABASE=defaultdb
MYSQL_USER=avnadmin
MYSQL_PASSWORD=SUA_SENHA_MYSQL
MYSQL_SSL=true
MYSQL_SSL_MODE=REQUIRED
MYSQL_SSL_REJECT_UNAUTHORIZED=false
```

Depois do deploy, teste:

```text
https://vitoriaregia1.onrender.com/api/health
https://vitoriaregia1.onrender.com/api/db/status
```

O resultado esperado em `/api/db/status` é `ok: true` e `ready: true`.

## Segurança

Não envie `.env`, senha do banco, tokens, API keys ou senha de app para o GitHub. Use apenas o painel do Render em Environment Variables.
