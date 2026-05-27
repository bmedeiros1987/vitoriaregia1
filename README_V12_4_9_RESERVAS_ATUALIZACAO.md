# Vitória Régia Pro v12.4.9

Correções aplicadas:

- Menu Reservas estabilizado diretamente pela rota `#/reservas/calendario`.
- Qualquer hash iniciado por `#/reservas` força a tela de Reservas a permanecer renderizada.
- O item Reservas fica marcado como ativo mesmo se houver troca de estado interno.
- O botão de upload de ZIP de atualização agora usa seletor de arquivo acionado por `ref`, removendo o problema do clique sem ação no input invisível.
- O sistema exibe aviso claro quando o perfil não é master/admin para envio de atualização.

Após publicar, faça logout/login e limpe o cache do navegador se a tela antiga continuar carregada.
