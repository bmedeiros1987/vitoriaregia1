# Vitória Régia v4.2.8 - Telegram integrado

Esta versão vincula o Telegram em todo o fluxo de notificações do sistema.

## Inclui

- Telegram em encomendas, visitantes, moradores, comunicados e avisos internos.
- Telegram integrado à central de emergência.
- Emergência avisa síndico/administração e porteiros do turno também por Telegram quando houver Chat ID cadastrado.
- Após confirmação da emergência, moradores podem receber alerta geral por Telegram.
- QR Codes para baixar Telegram no Android e iPhone.
- Guia de configuração na aba Apps, Ajuda e Configurações.
- Manuais atualizados com instruções e QR Codes.

## Importante

Para um usuário receber mensagem privada pelo Telegram, ele precisa iniciar conversa com o bot do condomínio. O campo @usuario ajuda na identificação, mas o envio automático confiável usa Chat ID.

## Variáveis no Render

TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=token_do_bot
TELEGRAM_BOT_USERNAME=nome_do_bot
TELEGRAM_DEFAULT_CHAT_ID=chat_id_padrao
TELEGRAM_TEST_CHAT_ID=chat_id_teste
TELEGRAM_PARSE_MODE=HTML
