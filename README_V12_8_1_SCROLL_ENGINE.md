# Vitória Régia Pro v12.8.1 — Correção avançada de scroll

Correção cumulativa focada no problema de rolagem em celular/tablet.

## Ajustes
- A rolagem principal passa a acontecer dentro de `.content`, não no `body`.
- `body`, `#root` e `.appShell` ficam estáveis em `100dvh`.
- Correção para mobile/tablet vertical e horizontal.
- Preserva bottom nav, botão de emergência e aviso premium sem cobrir o conteúdo.
- Asset CSS/JS renomeado para evitar cache antigo do navegador.

Depois de aplicar, recomenda-se limpar o cache do navegador/PWA ou abrir novamente o sistema.
