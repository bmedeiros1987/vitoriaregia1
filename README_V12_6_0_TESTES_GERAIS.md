# Vitória Régia Pro v12.6.1

Atualização cumulativa com correções solicitadas em Financeiro, Reservas e Telegram.

## Correções principais

- Restaura a tela Financeiro, com abas Movimentos, Boletos, Notas fiscais e Importar documento.
- Mantém a tela Reservas redesenhada, agora exibindo reservas confirmadas, pré-confirmadas, pré-agendadas e pendentes no calendário.
- Exibe horários parciais no calendário de Reservas, por exemplo 08:00 às 12:00 ou 19:00 às 23:00.
- Ajusta a detecção de conflitos de reservas no backend para bloquear sobreposição parcial de horários no mesmo espaço e data.
- Padroniza o Telegram em formato premium para notificações do sistema, seguindo o padrão visual das mensagens de emergência.
- Faz notificações gerais sem destinatário específico usarem o chat padrão do Telegram quando configurado.
- Mantém deduplicação global do Telegram para evitar mensagens repetidas.
- Reinsere telas de Cadastros para evitar que o menu quebre caso o componente esteja ausente.

## Testes executados

- `npm run build` na raiz do projeto.
- Build Vite do frontend.
- `node --check` no backend.

