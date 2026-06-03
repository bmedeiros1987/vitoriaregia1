# CrewCheck RC3 — Parser de precisão

Correções aplicadas nesta versão:

- ASB sempre é atividade operacional/reserva aeroportuária, nunca inativo/pernoite.
- MT usa janela operacional com estação + horário, corrigindo Meeting para 14:00–16:30 quando o PDF informa BSB 14:00 / BSB 16:30.
- Voos AIMS/CrewRoster agora procuram o padrão aeroporto-horário-aeroporto-horário, evitando BSB–BSB e CGH–CGH quando há aeroportos duplicados por causa de colunas de duty report/debrief.
- Durações como 02:30, 06:00, 00:59, 08:55 e 10:45 não são usadas como horário final de atividade.
- CRM é Corporate Resource Management.

Pontos de conferência esperados no PDF de junho/2026:

- 13/06 ASB 06:30–12:30
- 25/06 MT 14:00–16:30
- 29/06 ASB 06:30–12:30
- 21/06 LA3500 BSB–MAB 22:55–00:45(+1)
- 30/06 LA3824 CGH–JPA 20:25–23:40
