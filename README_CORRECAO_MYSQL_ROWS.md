# Correção MySQL/Aiven - rows undefined

Esta versão corrige o erro de inicialização no Render:

`Cannot read properties of undefined (reading '0')`

A correção deixa o backend aceitar corretamente o retorno do `mysql2`, evita falha quando índices já existem e mantém o banco MySQL/Aiven como obrigatório.

## Render

Build Command:

```bash
cd backend && npm install
```

Start Command:

```bash
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
