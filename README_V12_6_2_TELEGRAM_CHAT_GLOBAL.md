# Vitória Régia Pro v12.6.2 — Telegram com Chat ID global

Esta versão centraliza o Chat ID do Telegram em todo o sistema.

## Alterações

- Chat ID padrão do Telegram definido como `8188648317`.
- O sistema deixa de solicitar Chat ID em cadastro público, perfil, moradores, usuários e testes.
- O Chat ID passa a ser editável somente em Configurações > Notificações.
- Ao alterar o Chat ID em Notificações, o novo valor é usado por todo o sistema.
- Notificações Telegram usam o destino padrão quando o usuário/morador não possui Chat ID próprio.
- Testes de Telegram usam o chat padrão automaticamente.
- O Chat ID não é sobrescrito pelo Render em novos deploys, preservando a alteração feita no sistema.

## Valor padrão

`8188648317`
