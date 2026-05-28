# Vitória Régia Pro v12.6.1

Pacote cumulativo com token de atualização corrigido.

# Vitória Régia Pro v9.3

Sistema de gestão condominial completo para síndico, portaria, moradores e funcionários.

## Rodar localmente

```bash
cp .env.example .env
npm install --no-audit --no-fund
npm run build
npm start
```

## Produção no Render

```text
Build Command: npm install --no-audit --no-fund && npm run build
Start Command: npm start
Root Directory: vazio
```

O banco esperado é PostgreSQL por `DATABASE_URL`.

## Segurança

Não envie `.env`, tokens, senhas, `DATABASE_URL`, certificados, `node_modules`, `dist` ou `server/public` para o GitHub. Use variáveis de ambiente no Render.
