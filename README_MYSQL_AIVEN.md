# Sistema Vitória Régia — MySQL/Aiven

Esta versão foi adaptada para MySQL/Aiven, removendo a dependência do PostgreSQL.

## Render

Use o serviço como **Web Service**.

Build Command:

```bash
cd backend && npm install
```

Start Command:

```bash
cd backend && npm start
```

## Variáveis principais no Render

```env
DATABASE_PROVIDER=mysql
REQUIRE_DATABASE=true
AUTO_INIT_DB=true
MYSQL_HOST=mysql-1c3b1be8-vitoriaregia1.a.aivencloud.com
MYSQL_PORT=22966
MYSQL_DATABASE=defaultdb
MYSQL_USER=avnadmin
MYSQL_PASSWORD=SENHA_REAL_DO_MYSQL
MYSQL_SSL=true
MYSQL_SSL_MODE=REQUIRED
MYSQL_SSL_REJECT_UNAUTHORIZED=false
```

Você também pode usar `DATABASE_URL`, mas não precisa se já informou as variáveis separadas.

## Diagnóstico

Depois do deploy, acesse:

```text
https://vitoriaregia1.onrender.com/api/health
https://vitoriaregia1.onrender.com/api/db/status
```

O banco é inicializado automaticamente com `AUTO_INIT_DB=true`.

## Segurança

Não envie `.env`, senhas, tokens Asaas, MailerSend ou Evolution API ao GitHub. Configure tudo somente no Render.
