# Vitória Régia Pro v12.7.1

Atualização cumulativa com vínculo automático do Telegram por link/QR e melhoria da recuperação de senha temporária.

## Inclui

- Link único de vínculo Telegram gerado no cadastro.
- E-mail de confirmação de cadastro com botão **Vincular Telegram**.
- Webhook do Telegram reconhece `/start <token>` e salva automaticamente `telegram_chat_id`.
- Campos de vínculo em moradores, usuários, solicitações e perfil.
- Botão **Gerar link Telegram** para reenviar/copiar o vínculo.
- Tela de recuperação de senha puxa o e-mail já digitado na tela inicial.
- Botão de senha temporária ajustado para o padrão visual do sistema.

## Observação

O Telegram exige que o usuário toque em START/INICIAR no bot para que o Chat ID seja disponibilizado ao sistema.
