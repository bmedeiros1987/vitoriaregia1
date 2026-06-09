# CrewCheck v10.6.16 — Rotina sem choque de horário

Correção premium do planejador de rotina para impedir sugestões dentro de voos, reservas, sobreavisos e programações.

## Ajustes

- A rotina agora usa janelas bloqueadas reais por dia.
- Quando `dutyReport/dutyDebrief` estão ausentes ou contaminados por check/treinamento, o sistema bloqueia o horário real do primeiro voo até o último pouso.
- Sobreaviso, reserva e programação de solo recebem janelas de bloqueio próprias.
- As sugestões de rotina passam a validar sobreposição contra todas as janelas bloqueadas, com margem operacional antes e depois.
- Caso o dia tenha voo 15:55–19:20, nenhuma rotina pode ser sugerida dentro dessa faixa ou colada nela sem margem.

## Privacidade

Sem alteração em dados pessoais, login, C32F ou agenda ICS.
