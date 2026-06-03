# CrewCheck v10.3.0 · Parser Matrix

Correção focada na leitura robusta de CrewRosterReport e AIMS.

## Regras adicionadas
- Leitura AIMS por colunas usando posição X/Y dos itens do PDF.
- `Ma` no AIMS é sempre Maio quando o cabeçalho é 01/05 a 31/05.
- Meses com 28, 30 e 31 dias usam o último dia real do mês.
- ASB é atividade operacional, nunca inativo.
- HSB/HSBE são sobreaviso e não são somados entre dias.
- CRM/CRMB/CRMBSB = Corporate Resource Management.
- Voos com origem e destino iguais são descartados como leitura falsa.
- O parser bloqueia resultados com baixa cobertura para evitar escala enganosa.

## Conferência de Maio esperada
- 01–08/05: folgas DO/DOF.
- 09/05: LA3953, LA3590, LA3591.
- 18/05: HSB 10:05–12:00 e ASB 13:30–19:30.
- 21/05: CRM 09:00–13:00 e CRM 14:00–18:00.
- 24/05: JPA-CGH e CGH-BSB, sem CGH-CGH falso.
- 29/05: BSB-GYN-BSB-REC-BSB.
- 30/05: BSB-VCP-BSB-NAT.
