# Vitória Régia Pro v12.6.6 — Correção de colunas de Emergência

Correção cumulativa para erro ao cadastrar emergência em bancos já existentes.

## Corrigido

- Criação automática das colunas `occurrence_location`, `location_type`, `neighbor_unit` e `floor` em `emergency_requests`.
- Proteção adicional antes de salvar uma nova emergência, garantindo que as colunas existam mesmo em banco antigo.
- Mantidas as correções anteriores de Telegram, Suporte, Reservas, Comunicações e Cadastros.

## Validação

- `node --check server/src/index.js`
- `npm run build`
