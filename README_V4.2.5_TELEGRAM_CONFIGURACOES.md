# Vitória Régia v4.2.5 — Telegram e Configurações limpas

Melhorias desta versão:

- Envio automático por Telegram via Bot API.
- Configurações reorganizadas com atalhos por assunto.
- Diagnóstico rápido de e-mail, Telegram e WhatsApp no topo.
- QR Code para baixar o Telegram na aba Apps e Ajuda.
- Botões de Telegram adicionados às ações de aviso.
- Base MySQL mantida.
- Pacote completo com menos de 100 arquivos.

Variáveis novas no Render:

```env
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=token_do_bot
TELEGRAM_BOT_USERNAME=nome_do_bot
TELEGRAM_DEFAULT_CHAT_ID=chat_id_padrao
TELEGRAM_TEST_CHAT_ID=chat_id_de_teste
TELEGRAM_PARSE_MODE=HTML
```

Para usuários receberem Telegram, eles devem iniciar conversa com o bot antes.
