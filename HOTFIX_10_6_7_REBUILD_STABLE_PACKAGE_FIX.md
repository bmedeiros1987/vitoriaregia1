# CrewCheck v10.6.7 — Reconstrução estável / package.json válido

Base reconstruída a partir do pacote v10.6.0 disponível, reaplicando as correções estáveis das versões posteriores.

## Correções preservadas
- Tema claro/escuro com contraste melhorado.
- Rotina calculada para a escala inteira.
- Recomendações em Mais informações nos cards.
- Alertas clicáveis com explicação.
- Safe-area/notch e rodapé Android sem cobrir menu.
- Cache/service worker em modo rede-primeiro para JS/CSS.
- Proteção contra bundles antigos causando React #310.
- package.json validado como JSON.

## Validação
- npm run check
- npm run build
- node --check server.mjs
