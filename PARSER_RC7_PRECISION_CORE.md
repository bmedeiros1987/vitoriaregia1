# CrewCheck v10 — Precision Core

Esta versão troca a estratégia de leitura da escala para reduzir leituras falsas.

## Correções principais

- AIMS `Ma` é tratado como **Maio**.
- O mês de referência vem do cabeçalho da escala e respeita meses com 28, 30 ou 31 dias.
- Programações de voo são concatenadas no visual da escala, por exemplo `BSB – POA – CNF – POA`.
- ASB tem prioridade operacional e nunca deve virar inativo/pernoite.
- HSB/HSBE são sobreavisos independentes, sem somar dias diferentes.
- CRM/CRMB/CRMBSB = Corporate Resource Management.
- MT = Meeting / reunião com a chefia.
- Voos com origem e destino iguais são descartados como leitura falsa.
- O parser tenta PDF.js visual, PDF.js linear e pdf-parse no servidor.
- Se a leitura for insuficiente, o sistema bloqueia a análise em vez de mostrar uma escala enganosa.

## Conferência manual recomendada

Após o upload da escala de maio, verificar se aparecem:

- 01–08/05: folgas DO/DOF.
- 09/05: LA3953, LA3590, LA3591 agrupados.
- 18/05: HSB 10:05–12:00 e ASB 13:30–19:30.
- 21/05: CRM 09:00–13:00 e CRM 14:00–18:00.
- 22/05: LA4794, LA3867, LA3494 agrupados.
- 24/05: JPA-CGH-BSB, sem falso CGH-CGH.
- 29/05: LA3755, LA4648, LA4724, LA3425 agrupados.
- 30/05: LA3322, LA3323, LA3992 agrupados.

