# Deploy e persistencia

## Render

Publique o backend como Web Service:

```text
Build Command: cd backend && npm install
Start Command: cd backend && npm start
```

Configure as variaveis do MySQL/Aiven no Render. As principais sao:

```env
DATABASE_PROVIDER=mysql
REQUIRE_DATABASE=true
AUTO_INIT_DB=true
MYSQL_HOST=mysql-1c3b1be8-vitoriaregia1.a.aivencloud.com
MYSQL_PORT=22966
MYSQL_DATABASE=defaultdb
MYSQL_USER=avnadmin
MYSQL_PASSWORD=SUA_SENHA_ATUAL_DO_AIVEN
MYSQL_SSL=true
MYSQL_SSL_MODE=REQUIRED
MYSQL_SSL_REJECT_UNAUTHORIZED=false
```

Depois do deploy, teste:

```text
https://vitoriaregia1.onrender.com/api/db/status
```

O retorno esperado e `ok: true`, `ready: true` e `mode: "mysql"`.

## Vercel

Se o front-end for publicado na Vercel, mantenha o `vercel.json` desta versao. Ele encaminha `/api/*` e `/auth/*` para o Web Service do Render. Sem isso, a Vercel responde `index.html` nas chamadas de API e o app fica sem acesso ao banco.

## Seguranca

Nao envie `.env`, senha do banco, tokens de WhatsApp, Asaas, MailerSend ou storage para o GitHub. Configure segredos somente no painel do Render.
