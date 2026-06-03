# CrewCheck — Confiabilidade das irregularidades

Esta versão aplica uma camada de auditoria antes de transformar qualquer apontamento legal em irregularidade crítica.

## Classificações exibidas

- **Irregularidade confirmada**: horários lidos com alta confiança, cálculo objetivo e regra parametrizada.
- **Ponto de atenção**: item depende de ACT/CCT, GRF/SGRF, manual do operador, tipo de tripulação ou conferência operacional.
- **Leitura incerta**: o PDF trouxe horário, coluna ou duty inconsistente. O alerta é rebaixado para revisão e não deve ser tratado como irregularidade confirmada.

## Validações adicionadas

- Confere se duty report/debrief existem para atividade operacional.
- Detecta duty muito alto ou incoerente, possível inversão de colunas/horários.
- Não soma HSB/HSBE de dias diferentes.
- Exige evidência de leitura para repouso, jornada, sobreaviso, reserva, madrugada e tempo em solo.
- Mostra na tela os horários usados no cálculo e o dia citado.

## Regra de segurança

Se a leitura do PDF não for confiável, o CrewCheck gera **Leitura incerta — revisar PDF**, em vez de acusar irregularidade.
