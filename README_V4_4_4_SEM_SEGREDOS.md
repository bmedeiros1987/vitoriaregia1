# Vitória Régia v4.4.4 — Correções sem dados sensíveis

Esta versão preserva as correções da v4.4.2, mas remove tokens, senhas, chaves e URLs sensíveis do código.

## O que ficou no sistema

- Configurações premium por subabas.
- Atualização pelo sistema.
- Financeiro morador separado do financeiro administrativo.
- Canais Telegram, e-mail e WhatsApp/Periskope preparados.
- OCR/leitura de etiqueta com progresso.
- Menu mobile corrigido.
- Emergências por botões rápidos.

## O que foi removido do repositório

- Token do Telegram.
- Senhas SMTP/MailerSend.
- Chaves Periskope.
- Chaves Asaas.
- Token GitHub/Render.
- Senha e URL do banco.
- Arquivos `.env` e scripts com credenciais.

## Onde ficam os dados sensíveis

Todos os dados sensíveis devem ficar somente no Render, em Environment Variables.

Sistema desenvolvido em parceria por Bruno Saraiva e ChatGPT.
