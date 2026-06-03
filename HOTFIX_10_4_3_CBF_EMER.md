# CrewCheck 10.4.3 — Correção CBF/EMER e deduplicação de cursos

## Motivo
Foi identificado que a escala de 02/06 estava exibindo dois cursos como `CRM / Corporate Resource Management`, quando a conferência pelo Crew Lounge Connect mostra:

- 09:00–11:00 — `CBF` — EAD - Combate ao Fogo
- 11:00–13:00 — `EMER` — EAD - Emergências Gerais

## Correções aplicadas

- Adicionado reparo no normalizador para detectar pares de EAD LATAM que chegam do PDF/AIMS como CRM genérico.
- Quando há dois blocos genéricos sequenciais de treinamento no mesmo dia, com duração aproximada de 2h cada e janelas 09–11 / 11–13, o sistema converte para `CBF` e `EMER`.
- Também detecta diretamente textos como `CBF`, `EMER`, `Combate ao Fogo` e `Emergências Gerais`.
- Ajustados os rótulos da tela de resultados:
  - `CBF` → `EAD - Combate ao Fogo`
  - `EMER` → `EAD - Emergências Gerais`
- Ajustados os títulos usados na exportação e sincronização Google Calendar.
- Reforçada a remoção de duplicados visuais após normalização.

## Validação

Executado com sucesso:

```bash
npm run check
npm run build
node --check server.mjs
```
