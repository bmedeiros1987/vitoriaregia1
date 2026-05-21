# Configurações organizadas por submenus

Esta versão reorganiza a aba **Configurações** para deixar as integrações mais claras e profissionais.

## Submenus criados

- **E-mail**: SMTP/Gmail e MailerSend, com teste separado.
- **WhatsApp**: Periskope, Evolution API e Meta Cloud API, com teste separado.
- **Telegram**: bot do Telegram para alertas internos, síndico e portaria.
- **Boletos**: Asaas.
- **Nuvem**: Supabase Storage/TeraBox para fotos e documentos.
- **Diagnóstico**: resumo visual do que está ativo e das chaves salvas.

## Variáveis novas para Telegram no Render

```env
TELEGRAM_ENABLED=false
TELEGRAM_BOT_TOKEN=
TELEGRAM_DEFAULT_CHAT_ID=
TELEGRAM_ADMIN_CHAT_ID=
TELEGRAM_TEST_CHAT_ID=
TELEGRAM_PARSE_MODE=
```

O token do bot deve ficar apenas no Render ou no painel administrativo do sistema. Nunca publique o token no GitHub.

## Endpoints adicionados

- `GET /api/integrations/telegram/debug`
- `POST /api/integrations/test-telegram`

## Observação

As credenciais continuam protegidas: depois de salvas, o sistema mostra apenas que a chave/token existe, mas não exibe o valor novamente.
