# CrewCheck v3.0.6 RC6 — Auditoria de parser para Maio/AIMS

Correções aplicadas:

- `Ma` no AIMS é tratado como Maio, não Março.
- O cabeçalho do CrewRosterReport agora é detectado mesmo quando o PDF separa `Roster Report`, `Date` e o período em linhas diferentes.
- O servidor avalia múltiplas extrações (`pdfjs-linear`, `pdfjs-visual`, `pdf-parse`) e escolhe a mais completa por pontuação.
- Extrações com horas de voo no cabeçalho, mas poucos voos lidos, são bloqueadas como baixa confiança.
- Voos com origem e destino iguais continuam descartados como leitura falsa.
- ASB, HSB/HSBE, CRM/CRMB, MT/SAER e demais atividades operacionais têm prioridade sobre `(...)` e folgas residuais.

Conferência esperada para a escala de Maio/2026:

- 01–08/05: folgas DO/DOF.
- 09/05: LA3953, LA3590, LA3591.
- 10/05: LA3219, LA8130 até EZE.
- 12/05: LA8131 e LA4676.
- 18/05: HSB 10:05–12:00 e ASB 13:30–19:30.
- 21/05: CRM 09:00–13:00 e CRM 14:00–18:00.
- 22/05: LA4794, LA3867, LA3494.
- 24/05: LA3825 e LA4700 CGH–BSB; trecho falso CGH–CGH deve ser descartado.
- 25/05: HSBE no CrewRosterReport; SAER no AIMS caso esse formato esteja atualizado.
- 29/05: LA3755, LA4648, LA4724, LA3425.
- 30/05: LA3322, LA3323, LA3992 até NAT.
