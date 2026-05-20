# Sistema Vitória Régia — Banco operacional PostgreSQL

Esta versão troca o armazenamento temporário por um backend Node/Express com PostgreSQL/Aiven.

## O que foi implementado

- Backend com PostgreSQL usando `pg`.
- Criação automática das tabelas ao iniciar o servidor (`AUTO_INIT_DB=true`).
- Persistência operacional de:
  - moradores aprovados;
  - solicitações de cadastro pendentes;
  - reservas;
  - visitantes;
  - encomendas;
  - comunicados;
  - configurações do sistema;
  - configurações de e-mail/WhatsApp;
  - logs de notificações.
- Espelhamento dos dados do sistema em tabelas relacionais, além do estado principal em JSONB.
- Endpoint `/api/health` mostrando se o banco está pronto.
- Envio automático de e-mail via Gmail/SMTP.

## Estrutura esperada no GitHub

Envie os arquivos extraídos para o GitHub assim:

```text
vitoriaregia1/
  backend/
    package.json
    src/
      server.js
      db.js
      schema.js
      init-db.js
      test-db.js
  index.html
  app.js
  styles.css
  assets/
```

Não envie `.env`, certificados, senha de app, senha do banco ou tokens.

## Configuração no Render

Tipo de serviço:

```text
Web Service
```

Build Command:

```bash
cd backend && npm install
```

Start Command:

```bash
cd backend && npm start
```

## Variáveis obrigatórias no Render

Configure em **Render → Web Service → Environment**:

```env
NODE_ENV=production
PORT=10000
APP_URL=https://SEU-SITE.onrender.com
SESSION_SECRET=troque_por_uma_chave_grande_e_aleatoria

ADMIN_EMAILS=bmedeiros1987@gmail.com
PORTARIA_EMAILS=

PGHOST=vitoriaregia1-vitoriaregia1.f.aivencloud.com
PGPORT=22968
PGDATABASE=vitoriaregia1
PGUSER=bmedeiros1987@gmail.com
PGPASSWORD=SENHA_REAL_DO_BANCO_AIVEN
PGSSLMODE=require
PGSSL_REJECT_UNAUTHORIZED=false
AUTO_INIT_DB=true

SMTP_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=bmedeiros1987@gmail.com
SMTP_APP_PASSWORD=SENHA_DE_APP_DO_GOOGLE
SMTP_FROM_NAME=Condomínio Vitória Régia
SMTP_FROM_EMAIL=bmedeiros1987@gmail.com
SMTP_TEST_TO=bmedeiros1987@gmail.com
```

A senha de app do Google deve ir apenas no Render, nunca no GitHub.

## Como testar

Depois do deploy, abra:

```text
https://SEU-SITE.onrender.com/api/health
```

Você deve ver algo parecido com:

```json
{
  "ok": true,
  "database": {
    "configured": true,
    "ready": true
  }
}
```

Se `ready` estiver `false`, o backend subiu, mas o banco ainda não conectou. Verifique `PGPASSWORD`, host, porta e SSL.

## Inicialização manual do banco

Se quiser inicializar manualmente no servidor/local:

```bash
cd backend
npm install
npm run db:init
```

Para testar conexão:

```bash
cd backend
npm run db:test
```

## Sobre boleto real

O sistema gera cobrança/recibo interno para reserva. Para boleto bancário registrado de verdade, será necessário integrar um provedor de pagamentos, como Asaas, Gerencianet/Efi, banco com API ou outro PSP. O banco PostgreSQL já está preparado para armazenar reservas, status e comprovantes.
