# Vitória Régia Pro v12.5.9 — Correção definitiva da tela Reservas

Esta atualização corrige o problema visual em que a tela Reservas abria corretamente, mas ao trocar de submenu e voltar ficava quebrada, com um painel azul fixo à esquerda.

## Correções
- O painel lateral interno de Reservas deixou de usar a tag `<aside>`, evitando conflito com o CSS global do menu principal.
- Adicionada proteção de CSS para impedir que painéis internos recebam estilo do menu lateral.
- Abas da tela Reservas sincronizadas com o estado do submenu.
- Mantidas as correções anteriores de Comunicações, Telegram, Suporte, Encomendas e atualizações.
