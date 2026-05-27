# Vitória Régia Pro v12.5.2 — Telegram sem duplicidade global

Esta versão é cumulativa sobre a v12.5.1 e mantém as correções anteriores.

## Corrigido

- Deduplicação global do Telegram centralizada em `sendTelegramMessage`.
- A mesma mensagem para o mesmo chat não é enviada duas vezes, mesmo quando chamada por áreas diferentes do sistema.
- Evita duplicidade entre `createNotification()` automático e envios diretos dos módulos.
- Mantém funcionamento de emergência, encomendas, ocorrências, reservas, comunicados, síndico e teste nas configurações.
- Senha temporária agora evita disparo automático duplicado ao criar notificação interna.

## Configuração opcional

No Render, é possível ajustar o tempo da trava:

```env
TELEGRAM_DEDUPE_TTL_MS=60000
```

O padrão é 60 segundos.
