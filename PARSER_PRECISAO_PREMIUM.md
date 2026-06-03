# CrewCheck — Parser de PDF Premium v3

Esta versão reforça a leitura de CrewRosterReport e AIMS com prioridade operacional e auditoria dos eventos.

## Correções críticas

- ASB nunca é tratado como inativo/pernoite. ASB = Airport Stand By / reserva aeroportuária.
- MT é Meeting / reunião com a chefia e usa a janela real da linha/coluna.
- CRM = Corporate Resource Management.
- C32F = Check de competência A32F.
- AIMS com `(...)` é interpretado como continuação/pernoite apenas quando não houver atividade operacional no mesmo dia/coluna.
- DO, DR, DOF e OFF só entram como descanso quando não houver ASB/HSB/HSBE/voo/atividade no mesmo bloco.
- Horários repetidos no PDF são deduplicados para evitar janelas falsas.
- Duração como `02:30`, `06:00` ou `00:59` não substitui o horário final da atividade.

## Conferência esperada no PDF de junho/2026

- 13/06: ASB de 06:30 a 12:30.
- 29/06: ASB de 06:30 a 12:30.
- 25/06: MT de 14:00 a 16:30.
- 08/06: C32F e LA4546 preservados no mesmo dia como eventos distintos.
- 02/06: CBF e EMER preservados como eventos distintos.

## Regra de confiança

O sistema deve classificar inconsistências de leitura como `Leitura incerta`, não como irregularidade confirmada.
