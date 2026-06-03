# CrewCheck 10.4.6 - Concatenacao segura e escala de teste

Correcoes principais:

- Mantem todas as programacoes no mesmo dia quando o PDF traz mais de um evento para a mesma data.
- Ajusta automaticamente em +1 minuto o inicio da segunda programacao quando duas atividades do mesmo dia encostam ou se sobrepoem por pequeno erro de leitura.
- Exemplo: CBF 09:00-11:00 + EMER 11:00-13:00 vira CBF 09:00-11:00 + EMER 11:01-13:00.
- A regra evita falso positivo visual/analitico sem alterar horarios de voo.
- Inclui PDF de escala de teste com multiplas irregularidades e casos de borda para upload.
- Mantem as melhorias 10.4.5: PS em cinza, MT como reuniao, cores no Google Calendar e Client ID Google configuravel.

Arquivo de teste incluido:

- ESCALA_TESTE_IRREGULARIDADES_CREWCHECK.pdf

Use esse PDF para testar upload, deduplicacao, traducao de siglas, concatenacao, folgas, standby, reserva, PS, voo noturno e alertas.
