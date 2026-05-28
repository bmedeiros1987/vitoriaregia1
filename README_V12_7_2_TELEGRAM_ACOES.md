# Vitória Régia Pro v12.7.2 — Correção dos botões de ação do Telegram

Esta atualização corrige o processamento dos botões inline do Telegram para encomendas, emergências e confirmações de mensagens.

## Corrigido

- Webhook do Telegram agora aceita `callback_query` com processamento robusto.
- Botões de encomenda reconhecem formatos antigos e novos.
- Botões de emergência reconhecem formatos antigos e novos.
- O Telegram recebe resposta imediata ao clique, reduzindo falhas de timeout.
- Cliques são registrados na tabela `telegram_callback_events` para auditoria/diagnóstico.
- Compatibilidade com webhook antigo usando segredo na URL.
- Endpoint de diagnóstico: `/api/telegram/callback-events`.
- Mantidas todas as correções anteriores.

## Após aplicar

Acesse Configurações > Telegram e clique em **Configurar webhook**.
