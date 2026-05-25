# Vitória Régia Pro v9.9 — Emergência e Telegram

Correções principais:

- Corrigido erro ao confirmar solicitação de emergência.
- Mantido botão flutuante de emergência e fluxo de aprovação por portaria/síndico.
- Logo do condomínio redesenhada com aparência de prédio residencial.
- Menu lateral passa a exibir somente a versão abaixo da logo.
- Removido o termo "Conta-gotas" da escolha de cor; agora aparece "Cor principal do sistema".
- Teste de notificações volta a aparecer de forma direta em Configurações → Notificações.
- Telegram ganhou campos completos, teste do bot, configuração de webhook e consulta de status.

## Telegram

Configure no Render, nunca no GitHub:

TELEGRAM_ENABLED=true
ENABLE_TELEGRAM=true
TELEGRAM_START_URL=https://t.me/vitoriaregia_bot
TELEGRAM_BOT_USERNAME=vitoriaregia_bot
TELEGRAM_BOT_TOKEN=sua_chave_nova_do_bot
TELEGRAM_CHAT_ID=seu_chat_id
TELEGRAM_WEBHOOK_SECRET=um_segredo_forte
PUBLIC_APP_URL=https://seu-servico.onrender.com

Depois acesse Configurações → Telegram e use:

1. Salvar Telegram
2. Testar bot
3. Configurar webhook
4. Verificar webhook

A chave do bot não deve aparecer em arquivos do projeto.
