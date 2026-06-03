# CrewCheck RC4 — Parser de precisão

Esta versão torna o parser servidor obrigatório para evitar queda para parser local antigo no navegador.

Correções principais:

- ASB sempre é reserva aeroportuária, nunca inativo/pernoite.
- MT usa a janela de atividade correta por estação/horário, evitando 14:00–14:00.
- Voos com origem e destino iguais, como BSB-BSB ou CGH-CGH, são descartados como leitura falsa.
- AIMS com trecho partido por `(...)` tenta unir a continuação do dia seguinte para obter destino final real, como EZE, MAB, JPA etc.
- CRM/CRMB é tratado como Corporate Resource Management.
- O parser local não é mais usado como fallback silencioso quando o servidor falha; se o servidor falhar, a tela mostra erro para evitar escala incompleta enganosa.

Conferências esperadas nos PDFs de referência:

- CrewRosterReport maio: 18/05 HSB 10:05–12:00 e ASB 13:30–19:30.
- CrewRosterReport maio: 21/05 CRM 09:00–13:00 e CRM 14:00–18:00.
- CrewRosterReport maio: 24/05 deve evitar falso CGH-CGH como voo útil.
- CrewRosterReport junho: 25/06 MT 14:00–16:30.
- CrewRosterReport junho: 13/06 e 29/06 ASB 06:30–12:30.
