# CrewCheck 10.4.12

## Correções

- Adiciona filtro de sincronização Google Calendar: Tudo, Voos, Academia e Rotina.
- O filtro é salvo nas configurações e usado na sincronização manual e automática.
- O mesmo conceito foi levado ao gerador ICS, incluindo exportação de Rotina.
- Reforça o parser do CrewRosterReport para resgatar pernas de voo que cruzam a madrugada, especialmente LA3500 BSB 22:55 -> MAB 00:45(+1), com fim de jornada 01:15(+1).
- Ao resgatar corretamente a perna BSB-MAB no dia 21, o marcador do dia 22 passa a ser Chegada / fim de jornada, não dia livre.

## Caso validado

PDF CrewRosterReport junho/2026: dia 21 contém LA3818, LA3819 e LA3500; LA3500 chega em MAB no dia seguinte e debriefa às 01:15(+1).
