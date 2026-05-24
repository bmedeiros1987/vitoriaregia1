# Sistema Vitória Régia Pro v6.0

Sistema premium para gestão do Condomínio Vitória Régia, com painel moderno, atalhos rápidos, botão de emergência, configurações visuais e integração com PostgreSQL.

## Principais recursos

- Login protegido com JWT.
- Dashboard premium com atalhos estilo aplicativo.
- Menu lateral, superior ou flutuante.
- Tema claro/escuro, cor personalizada e densidade visual.
- Botão de emergência com registro de ocorrência e envio ao Telegram, quando configurado.
- Moradores, visitantes, portaria, encomendas, reservas, financeiro, comunicados, ocorrências e manutenção.
- Integração SMTP para e-mail e Telegram Bot.
- Auditoria das principais ações.
- Exportação de backup em JSON.
- PWA para usar como app no celular.
- Scripts para Termux e publicação no GitHub.

## Login padrão

- Usuário: `admin@vitoriaregia.local`
- Senha: `123456`

Altere `ADMIN_EMAIL`, `ADMIN_PASSWORD` e `JWT_SECRET` no arquivo `server/.env` antes de produção.

## Usando banco anterior

O sistema foi feito para preservar o banco existente. Ele cria novas tabelas e colunas com `CREATE TABLE IF NOT EXISTS` e `ALTER TABLE ADD COLUMN IF NOT EXISTS`, sem apagar os dados antigos.

Configure no `server/.env`:

```env
DATABASE_URL=postgres://usuario:senha@host:5432/database?sslmode=require
DATABASE_SSL=true
```

Para banco local no Termux, o instalador cria um PostgreSQL local automaticamente caso você não informe uma `DATABASE_URL` externa.

## Rodar localmente

```bash
cp .env.example server/.env
npm install
npm run build
npm start
```

Acesse: `http://localhost:3000`

## Render

Build command:

```bash
npm install && npm run build
```

Start command:

```bash
npm start
```

Defina as variáveis de ambiente no Render conforme `.env.example`.

## Segurança de publicação

Nunca envie `.env`, `server/.env`, `node_modules`, `client/dist`, logs, certificados ou chaves para o GitHub. Use as variáveis de ambiente no Render e rode o script `scripts/limpar_commit_seguro_vitoriaregia.sh` antes de publicar caso o app do GitHub mostre arquivos sensíveis no commit.
