# Vitória Régia v4.2.7 — Telegram nos cadastros

Esta versão adiciona campo **Telegram** aos cadastros de moradores, usuários internos/equipe e visitantes recorrentes.

O campo aceita:

- `@usuario`, quando o usuário souber o nome do Telegram;
- `Chat ID`, quando o usuário já iniciou conversa com o bot do condomínio.

O dado é salvo também como `telegramChatId` para facilitar o envio automático de mensagens pelo backend quando o Telegram estiver ativo em Configurações.
