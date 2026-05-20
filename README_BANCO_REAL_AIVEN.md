# Banco de dados real / modo operacional

Esta versão foi ajustada para usar PostgreSQL como banco obrigatório em produção. Ela não depende de localStorage como banco principal. O navegador usa localStorage apenas como cache temporário da tela, enquanto o backend grava o estado no PostgreSQL.

## Render

Use como **Web Service**.

Build Command:

```bash
cd backend && npm install
```

Start Command:

```bash
cd backend && npm start
```

## Variáveis obrigatórias no Render

```env
NODE_ENV=production
PORT=10000
APP_URL=https://SEU-SITE.onrender.com
SESSION_SECRET=troque_por_uma_chave_grande

REQUIRE_DATABASE=true
AUTO_INIT_DB=true

PGHOST=vitoriaregia1-vitoriaregia1.f.aivencloud.com
PGPORT=22968
PGDATABASE=vitoriaregia1
PGUSER=bmedeiros1987@gmail.com
PGPASSWORD=SENHA_REAL_DO_BANCO_AIVEN
PGSSLMODE=require
PGSSL_REJECT_UNAUTHORIZED=false

ADMIN_EMAILS=bmedeiros1987@gmail.com
```

Atenção: **PGPASSWORD não é certificado, chave privada nem token**. É a senha do usuário do banco exibida no painel da Aiven.

## Testes

Depois do deploy, abra:

```text
https://SEU-SITE.onrender.com/api/health
https://SEU-SITE.onrender.com/api/db/status
```

O resultado precisa indicar:

```json
"ready": true,
"mode": "postgresql"
```

## O que foi persistido no PostgreSQL

- moradores aprovados e pendentes;
- unidades alugadas e morador principal para boleto;
- reservas, calendário, documentos e convidados;
- visitantes;
- encomendas;
- comunicados;
- equipe: síndico, subsíndico e porteiros;
- serviços e solicitações;
- mensagens internas;
- configurações de e-mail, WhatsApp e Asaas;
- logs de notificações.

## Segurança

Não suba `.env`, certificados, senha do Gmail, token MailerSend, API Key Asaas ou senha do banco no GitHub. Tudo deve ficar em **Render → Environment Variables** ou Secret Files.
