# Vitória Régia Pro v12.4.8 — Correção forte do menu Reservas

Correção aplicada no frontend para impedir que a tela Reservas abra e feche rapidamente.

## Ajustes
- Função dedicada `isReservasHash()` reconhece qualquer variação de rota de reservas.
- `routeState()` força `active: reservas` quando a URL estiver em `#/reservas` ou `#/reservas/calendario`.
- `hashchange` sincroniza a rota imediatamente ao carregar a página.
- Trava extra mantém Reservas aberta mesmo se algum estado interno tentar voltar para outra tela.
- Renderização passa a usar `visibleActive`, garantindo que a URL mande na tela exibida.
- O botão Reservas da barra inferior e do menu lateral sempre aponta para `#/reservas/calendario`.

## Arquivo principal alterado
- `client/src/main.jsx`
