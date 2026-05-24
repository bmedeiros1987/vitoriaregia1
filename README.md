# Sistema Vitória Régia Pro v6.9

Sistema premium para gestão condominial com dashboard, atalhos rápidos, botão de emergência, moradores, visitantes, portaria, encomendas, reservas, financeiro, comunicados, ocorrências, manutenção, auditoria, configurações de tema/menu, Telegram, SMTP, PostgreSQL e PWA.

## Estrutura

- `client/`: interface React/Vite.
- `server/`: API Node/Express/PostgreSQL.
- `render.yaml`: configuração sugerida para Render.
- `.env.example`: modelo seguro, sem senhas reais.

## Render

Use na raiz do repositório:

```text
Build Command: npm install --no-audit --no-fund && npm run build
Start Command: npm start
Root Directory: vazio
```

Variáveis recomendadas:

```text
NODE_VERSION=20.19.0
NODE_ENV=production
DATABASE_URL=sua_url_real_no_render
DATABASE_SSL=auto
DATABASE_SSL_MODE=auto
JWT_SECRET=uma_senha_grande_e_forte
NPM_CONFIG_AUDIT=false
NPM_CONFIG_FUND=false
NPM_CONFIG_UPDATE_NOTIFIER=false
```

A `DATABASE_URL` deve ficar no Render ou no `.env` local. Nunca envie `.env` para o GitHub.


## SendGrid

Backend integrado com `@sendgrid/mail`.

Variáveis esperadas em produção:

```text
MAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=sua_nova_chave
SENDGRID_FROM_EMAIL=remetente_verificado
SENDGRID_FROM_NAME=Condomínio Vitória Régia
SENDGRID_TO_DEFAULT=email_padrao_para_testes_e_emergencia
SENDGRID_DATA_RESIDENCY=global
```

A chave real deve ficar somente nas variáveis de ambiente do Render.
