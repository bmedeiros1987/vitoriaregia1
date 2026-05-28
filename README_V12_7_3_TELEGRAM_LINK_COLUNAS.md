# Vitória Régia Pro v12.7.3 — Correção vínculo Telegram

Correção cumulativa para o erro ao clicar em **Gerar link Telegram**:

```txt
column "telegram_link_token" does not exist
```

## Corrigido

- Criação automática de `telegram_link_token` e `telegram_linked_at` em `residents`.
- Reforço da migração em `users` e `registration_requests`.
- A função de geração de link agora garante as colunas antes de fazer `SELECT` ou `UPDATE`.
- O webhook `/start <token>` também garante as colunas antes de vincular o Chat ID.

## Validação

- `npm run build` no frontend.
- `node --check server/src/index.js`.
