# Vitória Régia Pro v12.7.0 — Auditoria corrigida

Versão cumulativa baseada na v12.6.9.

## Correções

- Recriação da tela Configurações > Auditoria para evitar tela branca.
- Proteção contra retorno inesperado do backend em `/api/audit`, `/api/notifications` e `/api/error-logs`.
- Logs técnicos agora exibem aviso amigável quando o perfil não tem permissão master/admin.
- Sincronização do submenu de Configurações com a rota `#/configuracoes/auditoria`.
- Adicionado filtro de auditoria por usuário, ação, entidade ou data.
- Mantidas as correções anteriores de Emergência, Telegram, Encomendas, Reservas, Comunicações, Suporte e Notificações.

## Validação

- `npm run build` no frontend executado com sucesso.
- `node --check server/src/index.js` executado com sucesso.
