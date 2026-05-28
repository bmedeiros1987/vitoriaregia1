# Vitória Régia Pro v12.6.4 — Telegram nos cadastros e testes

Atualização cumulativa para permitir cadastro de usuário/Chat ID do Telegram em moradores, usuários, perfil e solicitações de cadastro.

## Incluído

- Campo `Usuário Telegram` nos cadastros, aceitando valores como `@portariavr1`.
- Campo `Chat ID Telegram` nos cadastros para recebimento direto das mensagens do sistema.
- Cadastro inicial e solicitação de morador adicional passam a aceitar Telegram.
- Perfil do usuário/morador permite atualizar Telegram.
- Tela de teste de notificações permite escolher:
  - chat padrão do condomínio;
  - Telegram da portaria;
  - morador cadastrado;
  - usuário cadastrado;
  - destino manual.
- Backend com migração automática da coluna `telegram_username` em usuários, moradores e solicitações.
- Teste Telegram evita cair no chat padrão quando o destino selecionado não tem Chat ID.

## Observação

Para usuários privados do Telegram receberem mensagem do bot, eles precisam iniciar conversa com `@vitoriaregia_bot` usando `/start`. O `@usuario` ajuda na identificação, mas o envio privado mais seguro usa o Chat ID numérico.
