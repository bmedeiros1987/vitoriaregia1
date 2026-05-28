# Vitória Régia Pro v12.6.8 — Telegram botões e confirmação de emergência

Correções cumulativas em cima da v12.6.7.

## Corrigido

- Botões inline de encomendas no Telegram agora são tratados pelo webhook de forma mais robusta.
- O fallback GET do Telegram foi bloqueado quando houver `reply_markup`, evitando envio sem botões.
- Callback de encomenda aceita variações `pkg:` e `package:`.
- Ao clicar em opção de encomenda, o sistema registra a preferência e avisa a portaria.
- Emergências enviam botões de confirmação/rejeição para Telegram de síndico, subsíndico, portaria, admin e chat da portaria.
- Clique em confirmação de emergência atualiza `emergency_requests`, registra auditoria e atualiza a mensagem do Telegram.
- `notifyStaff` agora respeita `channels.telegram=false` para evitar duplicidade quando há fluxo Telegram específico.

## Importante

Depois de aplicar, em Configurações > Telegram, clique em **Configurar webhook** para garantir que o bot esteja usando `/api/telegram/webhook` com `callback_query` habilitado.
