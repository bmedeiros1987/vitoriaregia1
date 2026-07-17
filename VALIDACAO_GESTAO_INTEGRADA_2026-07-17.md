# Validação — Gestão Integrada

- JavaScript `premium-integrated.js` validado com `node --check`.
- Integração isolada em arquivos públicos; nenhum endpoint, tabela ou permissão foi alterado.
- Menu e módulos são filtrados conforme o perfil salvo na sessão.
- O observador de interface usa debounce e assinatura de menu para evitar reconstrução contínua.
- O botão legado permanece oculto por CSS, sem interferir no carregamento dos módulos existentes.
- A central respeita menu lateral expandido, recolhido, flutuante, horizontal e visualização móvel.
