# Hotfix Render/Aiven — banco indisponível

Este pacote corrige a leitura da `DATABASE_URL` no backend para aceitar valores copiados com aspas externas, como `"mysql://..."`, que no Render podem causar erro `Invalid URL` no `mysql2`.

## Configuração recomendada no Render

Use **variáveis separadas**, sem aspas, em vez de `DATABASE_URL`:

```env
DATABASE_PROVIDER=mysql
REQUIRE_DATABASE=true
AUTO_INIT_DB=true
MYSQL_HOST=mysql-1c3b1be8-vitoriaregia1.a.aivencloud.com
MYSQL_PORT=22966
MYSQL_DATABASE=defaultdb
MYSQL_USER=avnadmin
MYSQL_PASSWORD=COLOQUE_A_SENHA_APENAS_NO_RENDER
MYSQL_SSL=true
MYSQL_SSL_MODE=REQUIRED
MYSQL_SSL_REJECT_UNAUTHORIZED=false
ALLOW_LEGACY_DEMO_LOGIN=false
REQUIRE_APPROVED_RESIDENT=true
```

No Render, o serviço deve ser **Web Service Node**, não apenas Static Site:

```text
Root Directory: backend
Build Command: npm install
Start Command: npm start
```

Após o deploy, teste:

```text
https://vitoriaregia1.onrender.com/api/health
https://vitoriaregia1.onrender.com/api/db/status
```

O esperado é `database.ready: true` e `/api/db/status` com `ok: true`.

## Segurança urgente

Remova qualquer arquivo `.env` público do GitHub e rotacione as senhas/tokens expostos. As variáveis sensíveis devem ficar somente no painel do Render/Aiven.
