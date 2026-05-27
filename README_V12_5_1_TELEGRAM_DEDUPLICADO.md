# Vitória Régia Pro v12.5.1 — Telegram sem duplicidade

Correções:

- Corrigida duplicidade de mensagens do Telegram na área de notificações do síndico.
- Adicionada trava de deduplicação para mensagens Telegram idênticas disparadas em sequência.
- Notificações individuais de morador/usuário agora só usam Telegram quando o destinatário tiver `telegram_chat_id` próprio.
- O `TELEGRAM_CHAT_ID` padrão continua funcionando para testes, emergência e avisos gerais da equipe, mas não é mais reutilizado automaticamente para cada morador sem chat próprio.

Observação:
Se vários moradores não tiverem `telegram_chat_id`, o sistema não repetirá a mesma mensagem várias vezes para o chat padrão.
