# Vitória Régia Pro v12.6.5 — Emergência e Suporte Telegram

Correções cumulativas sobre a v12.6.4.

## Corrigido

- Tela **Emergência** não abre mais em branco por falta dos helpers `EmergencyIcon` e `emergencyStatusText`.
- Emergência agora possui tipos padrão quando o backend ainda não retornou a tabela de tipos.
- Suporte envia Telegram direto para o chat de suporte/global, garantindo entrega ao chat padrão `8188648317`.
- Adicionada configuração opcional `TELEGRAM_SUPPORT_CHAT_ID` para direcionar suporte a outro Chat ID no futuro.
- Mantidas as correções anteriores de Telegram nos cadastros, testes, portaria premium, reservas, financeiro e comunicações.

## Observação

Para receber mensagem privada no Telegram, o usuário precisa ter enviado `/start` para o bot `@vitoriaregia_bot`. Para o suporte administrativo, o sistema agora usa o Chat ID padrão como fallback.
